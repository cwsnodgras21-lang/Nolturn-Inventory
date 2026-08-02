"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  createOrganizationAction,
  switchOrganizationAction,
} from "@/modules/organizations/actions";

type MembershipOption = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
};

export function OrganizationPicker({ memberships }: { memberships: MembershipOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoOrgId = searchParams.get("auto");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!autoOrgId) return;
    startTransition(async () => {
      const result = await switchOrganizationAction(autoOrgId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    });
  }, [autoOrgId, router]);

  function selectOrg(organizationId: string) {
    setError(null);
    startTransition(async () => {
      const result = await switchOrganizationAction(organizationId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    });
  }

  function createOrg(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createOrganizationAction({
        name,
        timezone: "America/Chicago",
        createDefaultLocation: true,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    });
  }

  if (autoOrgId && pending) {
    return <p className="text-sm text-muted">Opening your organization…</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8">
      {memberships.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Select organization</h2>
          <ul className="space-y-2">
            {memberships.map((m) => (
              <li key={m.organizationId}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => selectOrg(m.organizationId)}
                  className="flex w-full items-center justify-between rounded-md border border-border bg-surface px-4 py-3 text-left hover:border-accent"
                >
                  <span>
                    <span className="block font-medium">{m.organizationName}</span>
                    <span className="text-xs text-muted">{m.organizationSlug}</span>
                  </span>
                  <span className="text-sm text-accent">Continue</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-muted">
          You do not belong to an organization yet. Create one to continue.
        </p>
      )}

      <section className="space-y-3 border-t border-border pt-6">
        <h2 className="text-lg font-semibold">Create organization</h2>
        <form className="space-y-3" onSubmit={createOrg}>
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted">Organization name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              placeholder="Acme Clinic"
            />
          </label>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create organization"}
          </Button>
        </form>
      </section>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
