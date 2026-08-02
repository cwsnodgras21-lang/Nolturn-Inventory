"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { AppError, toSafeErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AUDIT_ACTIONS, writeAuditEvent } from "@/modules/audit";
import { mapAlertDbError } from "@/modules/alerts/mappers";
import type { AlertSyncResult } from "@/modules/alerts/types";

export type AlertActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

function fail(error: unknown): AlertActionResult<never> {
  if (error instanceof AppError) {
    return { ok: false, error: error.message, code: error.code };
  }
  return { ok: false, error: toSafeErrorMessage(error) };
}

function revalidateAlerts() {
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}

export async function syncOperationalAlertsAction(): Promise<
  AlertActionResult<AlertSyncResult>
> {
  try {
    const context = await requirePermission("alerts.manage");
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("sync_operational_alerts", {
      p_organization_id: context.organizationId,
    });

    if (error) throw new AppError("VALIDATION", mapAlertDbError(error.message), 400);

    const result = (data ?? {}) as Record<string, number>;
    const syncResult: AlertSyncResult = {
      created: Number(result.created ?? 0),
      updated: Number(result.updated ?? 0),
      resolved: Number(result.resolved ?? 0),
      activeConditions: Number(result.activeConditions ?? 0),
    };

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.ALERTS_SYNCED,
      entityType: "operational_alerts",
      entityId: context.organizationId,
      summary: `Synced operational alerts (${syncResult.created} new, ${syncResult.resolved} resolved)`,
      metadata: syncResult,
    });

    revalidateAlerts();
    return { ok: true, data: syncResult };
  } catch (error) {
    return fail(error);
  }
}

export async function acknowledgeAlertAction(
  alertId: string,
): Promise<AlertActionResult> {
  try {
    const context = await requirePermission("alerts.manage");
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase
      .from("operational_alerts")
      .select("id, status, title")
      .eq("id", alertId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!existing) throw new AppError("NOT_FOUND", "Alert not found.", 404);
    if (existing.status === "resolved") {
      throw new AppError("VALIDATION", "Resolved alerts cannot be acknowledged.", 400);
    }
    if (existing.status === "acknowledged") {
      return { ok: true, data: undefined };
    }

    const { error } = await supabase
      .from("operational_alerts")
      .update({
        status: "acknowledged",
        acknowledged_by: context.userId,
        acknowledged_at: new Date().toISOString(),
      })
      .eq("id", alertId);

    if (error) throw new AppError("VALIDATION", mapAlertDbError(error.message), 400);

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.ALERTS_ACKNOWLEDGED,
      entityType: "operational_alert",
      entityId: alertId,
      summary: `Alert acknowledged: ${existing.title}`,
    });

    revalidateAlerts();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function resolveAlertAction(alertId: string): Promise<AlertActionResult> {
  try {
    const context = await requirePermission("alerts.manage");
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase
      .from("operational_alerts")
      .select("id, status, title")
      .eq("id", alertId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!existing) throw new AppError("NOT_FOUND", "Alert not found.", 404);
    if (existing.status === "resolved") {
      return { ok: true, data: undefined };
    }

    const { error } = await supabase
      .from("operational_alerts")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", alertId);

    if (error) throw new AppError("VALIDATION", mapAlertDbError(error.message), 400);

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.ALERTS_RESOLVED,
      entityType: "operational_alert",
      entityId: alertId,
      summary: `Alert resolved: ${existing.title}`,
    });

    revalidateAlerts();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}
