"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  createInvitationAction,
  revokeInvitationAction,
} from "@/modules/onboarding/commands";
import type { InvitationListItem } from "@/modules/onboarding/types";

type RoleOption = { id: string; name: string; key: string };
type LocationOption = { id: string; name: string };

export function MembersInvitationsPanel({
  roles,
  locations,
  invitations,
  canManage,
}: {
  roles: RoleOption[];
  locations: LocationOption[];
  invitations: InvitationListItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canManage) {
    return (
      <p className="text-sm text-muted">
        Invitation management requires members.manage. Production email delivery is not configured;
        local/dev invites return a copyable accept link.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Invitations</h2>
        <p className="text-sm text-muted">
          Invite by email with role and location access. Email delivery integration is deferred —
          share the accept link shown after create.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {inviteLink ? (
        <p className="break-all text-sm">
          Accept link: <code className="text-accent">{inviteLink}</code>
        </p>
      ) : null}

      <form
        className="grid gap-3 border border-border bg-surface p-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setError(null);
          setInviteLink(null);
          startTransition(async () => {
            const result = await createInvitationAction({
              email: String(form.get("email") ?? ""),
              roleId: String(form.get("roleId") ?? ""),
              locationAccessMode: String(form.get("locationAccessMode") ?? "all") as
                | "all"
                | "restricted",
              locationIds: form.getAll("locationIds").map(String),
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setInviteLink(result.data.acceptPath);
            event.currentTarget.reset();
            router.refresh();
          });
        }}
      >
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-sm text-muted">Email</span>
          <input
            name="email"
            type="email"
            required
            className="w-full border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted">Role</span>
          <select
            name="roleId"
            required
            defaultValue={roles.find((r) => r.key === "staff")?.id ?? roles[0]?.id}
            className="w-full border border-border bg-background px-3 py-2 text-sm"
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted">Location access</span>
          <select
            name="locationAccessMode"
            defaultValue="all"
            className="w-full border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="all">All locations</option>
            <option value="restricted">Restricted</option>
          </select>
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm text-muted">Restricted locations</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {locations.map((location) => (
              <label key={location.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="locationIds" value={location.id} />
                {location.name}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            Send invitation
          </Button>
        </div>
      </form>

      {invitations.length === 0 ? (
        <p className="text-sm text-muted">No invitations yet.</p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {invitations.map((invite) => (
            <li
              key={invite.id}
              className="flex flex-wrap items-center justify-between gap-2 bg-surface px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{invite.email}</p>
                <p className="text-xs text-muted">
                  {invite.roleName} · {invite.status} · expires{" "}
                  {new Date(invite.expiresAt).toLocaleDateString()}
                </p>
              </div>
              {invite.status === "pending" ? (
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const result = await revokeInvitationAction(invite.id);
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      router.refresh();
                    });
                  }}
                >
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
