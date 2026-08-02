import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { can } from "@/lib/permissions";
import { listLocationsForOrganization } from "@/modules/locations";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const { user, tenant } = await resolvePlatformContext();
  const locations = await listLocationsForOrganization(tenant.organizationId);

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div className="space-y-3">
        <Badge tone="accent">Version 1.0 RC</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="max-w-2xl text-muted">
          Operational home for {tenant.organizationName}. Use the navigation for inventory,
          purchasing, and alerts.
        </p>
      </div>

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
      </div>

      <div className="border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Session status</h2>
        <ul className="mt-3 space-y-1 text-sm text-muted">
          <li>Authentication: active</li>
          <li>Tenant context: resolved</li>
          <li>Permissions: {tenant.permissionKeys.length} granted</li>
          <li>Accessible locations: {locations.length}</li>
          <li>Nolt intelligence: planned (Phase 7)</li>
        </ul>
      </div>
    </section>
  );
}
