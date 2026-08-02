import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { listOrganizationMembers, listOrganizationRoles } from "@/modules/identity";
import { listLocationsForOrganization } from "@/modules/locations";
import { MembersInvitationsPanel } from "@/modules/onboarding/components/members-invitations-panel";
import { listOrganizationInvitations } from "@/modules/onboarding";

export const metadata: Metadata = {
  title: "Members",
};

export default async function MembersAdminPage() {
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("members.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  const [members, roles, locations, invitations] = await Promise.all([
    listOrganizationMembers(tenant.organizationId),
    listOrganizationRoles(tenant.organizationId),
    listLocationsForOrganization(tenant.organizationId),
    listOrganizationInvitations(),
  ]);

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div className="space-y-3">
        <Badge>Members</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Members</h1>
        <p className="text-muted">
          Active memberships and pending invitations. Production email delivery is not configured
          yet; local/dev invites expose a copyable accept link.
        </p>
      </div>

      <MembersInvitationsPanel
        roles={roles.map((r) => ({ id: r.id, name: r.name, key: r.key }))}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        invitations={invitations}
        canManage={can(tenant, "members.manage")}
      />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Active members</h2>
        {members.length === 0 ? (
          <p className="text-sm text-muted">No members found.</p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {members.map((member) => {
              const rolesLabel = member.membership_roles
                .map((mr) => mr.roles?.name ?? mr.roles?.key)
                .filter(Boolean);

              return (
                <li key={member.id} className="bg-surface px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {member.profiles?.display_name ||
                          member.profiles?.email ||
                          member.user_id}
                      </p>
                      <p className="text-xs text-muted">{member.profiles?.email}</p>
                    </div>
                    <span className="text-xs uppercase tracking-wide text-muted">
                      {member.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    Roles: {rolesLabel.join(", ") || "None"} · Location access:{" "}
                    {member.location_access_mode}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
