import "server-only";

import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapOperationalAlert } from "@/modules/alerts/mappers";
import type {
  AlertSeverity,
  AlertStatus,
  AlertType,
  OperationalAlert,
} from "@/modules/alerts/types";

export async function listOperationalAlerts(options?: {
  alertType?: AlertType | "all";
  severity?: AlertSeverity | "all";
  /** Default: open + acknowledged. Use "all" for history including resolved. */
  status?: AlertStatus | "all" | "active";
  locationId?: string | "all";
}): Promise<OperationalAlert[]> {
  const context = await requirePermission("alerts.read");
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("operational_alerts")
    .select(
      `id, organization_id, alert_type, severity, entity_type, entity_id, location_id,
      condition_key, title, description, status, detected_at, acknowledged_by, acknowledged_at,
      resolved_at, created_at, updated_at, locations(name)`,
    )
    .eq("organization_id", context.organizationId)
    .order("detected_at", { ascending: false });

  if (options?.alertType && options.alertType !== "all") {
    query = query.eq("alert_type", options.alertType);
  }
  if (options?.severity && options.severity !== "all") {
    query = query.eq("severity", options.severity);
  }
  const statusFilter = options?.status ?? "active";
  if (statusFilter === "active") {
    query = query.in("status", ["open", "acknowledged"]);
  } else if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }
  if (options?.locationId && options.locationId !== "all") {
    query = query.eq("location_id", options.locationId);
  }

  const { data, error } = await query;
  if (error) throw new AppError("INTERNAL", "Unable to load alerts.", 500);
  return (data ?? []).map((row) =>
    mapOperationalAlert(row as unknown as Parameters<typeof mapOperationalAlert>[0]),
  );
}

export async function countOpenAlerts(): Promise<number> {
  const context = await requirePermission("alerts.read");
  const supabase = await createServerSupabaseClient();
  const { count, error } = await supabase
    .from("operational_alerts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", context.organizationId)
    .in("status", ["open", "acknowledged"]);

  if (error) throw new AppError("INTERNAL", "Unable to count alerts.", 500);
  return count ?? 0;
}
