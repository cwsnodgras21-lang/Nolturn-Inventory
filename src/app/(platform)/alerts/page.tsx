import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import {
  AlertsFilterBar,
  AlertsTable,
  AlertsToolbar,
} from "@/modules/alerts/components/alerts-workspace";
import { syncOperationalAlertsAction } from "@/modules/alerts/commands";
import { listOperationalAlerts } from "@/modules/alerts/queries";
import type { AlertSeverity, AlertStatus, AlertType } from "@/modules/alerts/types";
import {
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  ALERT_TYPES,
} from "@/modules/alerts/types";
import { listLocationsForOrganization } from "@/modules/locations";

export const metadata: Metadata = {
  title: "Alerts",
};

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    severity?: string;
    status?: string;
    location?: string;
  }>;
}) {
  const { tenant } = await resolvePlatformContext();
  const params = await searchParams;

  try {
    await requirePermission("alerts.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  const canManage = can(tenant, "alerts.manage");
  if (canManage) {
    await syncOperationalAlertsAction();
  }

  const alertType = ALERT_TYPES.includes(params.type as AlertType)
    ? (params.type as AlertType)
    : "all";
  const severity = ALERT_SEVERITIES.includes(params.severity as AlertSeverity)
    ? (params.severity as AlertSeverity)
    : "all";
  const statusParam = params.status ?? "all";
  const statusFilter =
    statusParam === "history"
      ? ("all" as const)
      : ALERT_STATUSES.includes(statusParam as AlertStatus)
        ? (statusParam as AlertStatus)
        : ("active" as const);
  const locationId = params.location ?? "all";

  const [alerts, locations] = await Promise.all([
    listOperationalAlerts({
      alertType,
      severity,
      status: statusFilter,
      locationId,
    }),
    listLocationsForOrganization(tenant.organizationId),
  ]);

  const accessibleLocations = locations.filter((location) =>
    tenant.allowedLocationIds.includes(location.id),
  );

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <div className="space-y-3">
        <Badge>Alerts</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Alerts</h1>
        <p className="text-muted">
          Deterministic operational alerts from reorder, lots, recalls, counts, and purchasing.
          Conditions clear automatically when the underlying issue is gone.
        </p>
      </div>

      <AlertsToolbar canManage={canManage} />
      <AlertsFilterBar
        alertType={alertType}
        severity={severity}
        status={statusParam}
        locationId={locationId}
        locations={accessibleLocations.map((location) => ({
          id: location.id,
          name: location.name,
        }))}
      />
      <AlertsTable alerts={alerts} canManage={canManage} />
    </section>
  );
}
