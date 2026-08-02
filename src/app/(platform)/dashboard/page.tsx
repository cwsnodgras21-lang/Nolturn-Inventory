import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { can } from "@/lib/permissions";
import { listLocationsForOrganization } from "@/modules/locations";
import { getOnboardingDashboardSummary } from "@/modules/onboarding";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const { user, tenant } = await resolvePlatformContext();
  const locations = await listLocationsForOrganization(tenant.organizationId);
  const onboarding = await getOnboardingDashboardSummary();

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div className="space-y-3">
        <Badge tone="accent">Version 1.0</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="max-w-2xl text-muted">
          Operational home for {tenant.organizationName}. Use setup guidance below until the
          workspace is ready, then jump into inventory workflows.
        </p>
      </div>

      {onboarding.state && !onboarding.isComplete ? (
        <div className="space-y-4 border border-border bg-surface p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Setup progress</h2>
              <p className="text-sm text-muted">
                {onboarding.progressPercent}% complete · resume anytime
              </p>
            </div>
            {can(tenant, "organization.manage") ? (
              <Button href="/onboarding">Continue setup</Button>
            ) : null}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full bg-accent transition-[width] duration-500"
              style={{ width: `${onboarding.progressPercent}%` }}
            />
          </div>
          <ul className="space-y-2">
            {onboarding.checklist.map((item) => (
              <li key={item.key} className="flex items-center justify-between text-sm">
                <span>
                  {item.label}
                  {!item.required ? (
                    <span className="text-muted"> · optional</span>
                  ) : null}
                </span>
                <span className={item.done ? "text-success" : "text-warning"}>
                  {item.done ? (item.skipped ? "Skipped" : "Ready") : "Needed"}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 pt-2">
            {can(tenant, "catalog.manage") ? (
              <Button href="/administration/catalog/items/new" variant="secondary">
                Add first item
              </Button>
            ) : null}
            {can(tenant, "members.manage") ? (
              <Button href="/onboarding?step=invite" variant="secondary">
                Invite teammate
              </Button>
            ) : null}
            {can(tenant, "inventory.adjust") ? (
              <Button href="/inventory/transactions/new" variant="secondary">
                Record opening balance
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {can(tenant, "inventory.read") ? (
            <Button href="/inventory" variant="secondary">
              Inventory
            </Button>
          ) : null}
          {can(tenant, "purchasing.read") ? (
            <Button href="/purchasing" variant="secondary">
              Purchasing
            </Button>
          ) : null}
          {can(tenant, "alerts.read") ? (
            <Button href="/alerts" variant="secondary">
              Alerts
            </Button>
          ) : null}
          {can(tenant, "organization.manage") ? (
            <Button href="/onboarding" variant="ghost">
              Review setup
            </Button>
          ) : null}
        </div>
      )}

      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="border border-border bg-surface p-4">
          <dt className="text-xs uppercase tracking-wide text-muted">Signed in as</dt>
          <dd className="mt-1 text-sm font-medium">{user.email}</dd>
        </div>
        <div className="border border-border bg-surface p-4">
          <dt className="text-xs uppercase tracking-wide text-muted">Active organization</dt>
          <dd className="mt-1 text-sm font-medium">
            {tenant.organizationName}{" "}
            <span className="text-muted">({tenant.organizationSlug})</span>
          </dd>
        </div>
        <div className="border border-border bg-surface p-4">
          <dt className="text-xs uppercase tracking-wide text-muted">Roles</dt>
          <dd className="mt-1 text-sm font-medium">
            {tenant.roleKeys.length ? tenant.roleKeys.join(", ") : "None"}
          </dd>
        </div>
        <div className="border border-border bg-surface p-4">
          <dt className="text-xs uppercase tracking-wide text-muted">Location access</dt>
          <dd className="mt-1 text-sm font-medium">
            {tenant.locationAccessMode === "all"
              ? `All locations (${locations.length})`
              : `Restricted (${tenant.allowedLocationIds.length} assigned)`}
          </dd>
        </div>
      </dl>
    </section>
  );
}
