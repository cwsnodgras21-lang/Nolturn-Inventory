"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { AppError, toSafeErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AUDIT_ACTIONS, writeAuditEvent } from "@/modules/audit";
import { mapRecallDbError } from "@/modules/recalls/mappers";
import {
  attachRecallLotSchema,
  createRecallSchema,
  recallStatusSchema,
  updateRecallSchema,
} from "@/modules/recalls/schemas";

export type RecallActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

function fail(error: unknown): RecallActionResult<never> {
  if (error instanceof AppError) {
    return { ok: false, error: error.message, code: error.code };
  }
  return { ok: false, error: toSafeErrorMessage(error) };
}

function revalidateRecalls(recallId?: string) {
  revalidatePath("/inventory");
  revalidatePath("/inventory/recalls");
  revalidatePath("/inventory/lots");
  if (recallId) revalidatePath(`/inventory/recalls/${recallId}`);
}

export async function createRecallAction(
  raw: unknown,
): Promise<RecallActionResult<{ id: string }>> {
  try {
    const input = createRecallSchema.parse(raw);
    const context = await requirePermission("inventory.recalls.manage");
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("inventory_recalls")
      .insert({
        organization_id: context.organizationId,
        title: input.title,
        recall_number: input.recallNumber,
        external_reference: input.externalReference?.trim() || null,
        source: input.source,
        severity: input.severity,
        announced_date: input.announcedDate || null,
        notes: input.notes?.trim() || null,
        status: "draft",
        created_by: context.userId,
      })
      .select("id, recall_number")
      .single();

    if (error || !data) {
      throw new AppError("VALIDATION", mapRecallDbError(error?.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_RECALL_CREATED,
      entityType: "inventory_recall",
      entityId: data.id,
      summary: `Recall created: ${data.recall_number}`,
    });

    revalidateRecalls(data.id);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateRecallAction(
  recallId: string,
  raw: unknown,
): Promise<RecallActionResult> {
  try {
    const input = updateRecallSchema.parse(raw);
    const context = await requirePermission("inventory.recalls.manage");
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase
      .from("inventory_recalls")
      .select("id, status")
      .eq("id", recallId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!existing) throw new AppError("NOT_FOUND", "Recall not found.", 404);
    if (existing.status === "resolved" || existing.status === "cancelled") {
      throw new AppError("VALIDATION", "Closed recalls cannot be edited.", 400);
    }

    const { error } = await supabase
      .from("inventory_recalls")
      .update({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.externalReference !== undefined
          ? { external_reference: input.externalReference?.trim() || null }
          : {}),
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(input.severity !== undefined ? { severity: input.severity } : {}),
        ...(input.announcedDate !== undefined
          ? { announced_date: input.announcedDate || null }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      })
      .eq("id", recallId);

    if (error) throw new AppError("VALIDATION", mapRecallDbError(error.message), 400);

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_RECALL_UPDATED,
      entityType: "inventory_recall",
      entityId: recallId,
      summary: "Recall updated",
      metadata: input as Record<string, unknown>,
    });

    revalidateRecalls(recallId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function setRecallStatusAction(
  recallId: string,
  raw: unknown,
): Promise<RecallActionResult> {
  try {
    const input = recallStatusSchema.parse(raw);
    const context = await requirePermission("inventory.recalls.manage");
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase
      .from("inventory_recalls")
      .select("id, status, recall_number")
      .eq("id", recallId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!existing) throw new AppError("NOT_FOUND", "Recall not found.", 404);

    const closing = input.status === "resolved" || input.status === "cancelled";
    const { error } = await supabase
      .from("inventory_recalls")
      .update({
        status: input.status,
        closed_by: closing ? context.userId : null,
        closed_at: closing ? new Date().toISOString() : null,
      })
      .eq("id", recallId);

    if (error) throw new AppError("VALIDATION", mapRecallDbError(error.message), 400);

    const action =
      input.status === "active"
        ? AUDIT_ACTIONS.INVENTORY_RECALL_ACTIVATED
        : input.status === "resolved"
          ? AUDIT_ACTIONS.INVENTORY_RECALL_RESOLVED
          : input.status === "cancelled"
            ? AUDIT_ACTIONS.INVENTORY_RECALL_CANCELLED
            : AUDIT_ACTIONS.INVENTORY_RECALL_UPDATED;

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action,
      entityType: "inventory_recall",
      entityId: recallId,
      summary: `Recall ${existing.recall_number} set to ${input.status}`,
      metadata: { previousStatus: existing.status, status: input.status },
    });

    revalidateRecalls(recallId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function attachRecallLotAction(
  recallId: string,
  raw: unknown,
): Promise<RecallActionResult<{ id: string }>> {
  try {
    const input = attachRecallLotSchema.parse(raw);
    const context = await requirePermission("inventory.recalls.manage");
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("inventory_recall_lots")
      .insert({
        organization_id: context.organizationId,
        recall_id: recallId,
        lot_id: input.lotId,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new AppError("VALIDATION", mapRecallDbError(error?.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_RECALL_LOT_ATTACHED,
      entityType: "inventory_recall",
      entityId: recallId,
      summary: "Lot attached to recall",
      metadata: { lotId: input.lotId },
    });

    revalidateRecalls(recallId);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function detachRecallLotAction(
  recallId: string,
  recallLotId: string,
): Promise<RecallActionResult> {
  try {
    const context = await requirePermission("inventory.recalls.manage");
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase
      .from("inventory_recall_lots")
      .select("id, lot_id")
      .eq("id", recallLotId)
      .eq("recall_id", recallId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!existing) throw new AppError("NOT_FOUND", "Recall lot not found.", 404);

    const { error } = await supabase
      .from("inventory_recall_lots")
      .delete()
      .eq("id", recallLotId);

    if (error) throw new AppError("VALIDATION", mapRecallDbError(error.message), 400);

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_RECALL_LOT_DETACHED,
      entityType: "inventory_recall",
      entityId: recallId,
      summary: "Lot detached from recall",
      metadata: { lotId: existing.lot_id },
    });

    revalidateRecalls(recallId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function quarantineRecallLotsAction(
  recallId: string,
): Promise<RecallActionResult<{ count: number }>> {
  try {
    const context = await requirePermission("inventory.recalls.manage");
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase.rpc("quarantine_recall_lots", {
      p_recall_id: recallId,
    });

    if (error) throw new AppError("VALIDATION", mapRecallDbError(error.message), 400);

    const count = Number(data ?? 0);

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_RECALL_LOTS_QUARANTINED,
      entityType: "inventory_recall",
      entityId: recallId,
      summary: `Quarantined ${count} lot(s) via recall`,
      metadata: { count },
    });

    revalidateRecalls(recallId);
    return { ok: true, data: { count } };
  } catch (error) {
    return fail(error);
  }
}
