import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { listOrganizationRoles } from "@/modules/identity";

export const metadata: Metadata = {
  title: "Roles",
};

export default async function RolesAdminPage() {
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("roles.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  const roles = await listOrganizationRoles(tenant.organizationId);

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div className="space-y-3">
        <Badge>Roles</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Roles and permissions</h1>
        <p className="text-muted">
          System roles are seeded per organization. Inventory and purchasing roles exist for forward
          compatibility but do not include inventory permissions yet.
        </p>
      </div>

      <ul className="space-y-3">
        {roles.map((role) => {
          const permissions = role.role_permissions
            .map((rp) => rp.permissions?.key)
            .filter(Boolean);

          return (
            <li key={role.id} className="border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-medium">{role.name}</h2>
                {role.is_system ? (
                  <span className="text-xs uppercase tracking-wide text-muted">System</span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted">{role.description}</p>
              <p className="mt-3 text-xs text-muted">{permissions.join(", ")}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
