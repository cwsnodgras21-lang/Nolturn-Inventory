"use server";

import { revalidatePath } from "next/cache";
import { requireLocationAccess, requirePermission } from "@/lib/auth";
import { AppError, toSafeErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AUDIT_ACTIONS, writeAuditEvent } from "@/modules/audit";
import { mapCountDbError } from "@/modules/counts/mappers";
import {
  addCountLineSchema,
  createCountSessionSchema,
  recordCountLineSchema,
  reviewCountLineSchema,
  updateCountSessionSchema,
} from "@/modules/counts/schemas";

export type CountActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

function fail(error: unknown): CountActionResult<never> {
  if (error instanceof AppError) {
    return { ok: false, error: error.message, code: error.code };
  }
  return { ok: false, error: toSafeErrorMessage(error) };
}

function revalidateCounts(sessionId?: string) {
  revalidatePath("/inventory");
  revalidatePath("/inventory/counts");
  revalidatePath("/inventory/stock");
  revalidatePath("/inventory/transactions");
  if (sessionId) {
    revalidatePath(`/inventory/counts/${sessionId}`);
  }
}

export async function createCountSessionAction(
  raw: unknown,
): Promise<CountActionResult<{ id: string }>> {
  try {
    const input = createCountSessionSchema.parse(raw);
    const context = await requirePermission("inventory.count.perform");
    const supabase = await createServerSupabaseClient();

    for (const locationId of input.locationIds) {
      await requireLocationAccess(locationId);
    }

    const { data: session, error } = await supabase
      .from("count_sessions")
      .insert({
        organization_id: context.organizationId,
        name: input.name,
        status: "draft",
        blind_count_enabled: input.blindCountEnabled,
        notes: input.notes ?? null,
        created_by: context.userId,
      })
      .select("id, name")
      .single();

    if (error || !session) {
      throw new AppError("VALIDATION", mapCountDbError(error?.message), 400);
    }

    const { error: locError } = await supabase.from("count_session_locations").insert(
      input.locationIds.map((locationId) => ({
        organization_id: context.organizationId,
        count_session_id: session.id,
        location_id: locationId,
      })),
    );

    if (locError) {
      await supabase.from("count_sessions").delete().eq("id", session.id);
      throw new AppError("VALIDATION", mapCountDbError(locError.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_COUNT_CREATED,
      entityType: "count_session",
      entityId: session.id,
      summary: `Count session created: ${session.name}`,
      metadata: {
        locationIds: input.locationIds,
        blindCountEnabled: input.blindCountEnabled,
      },
    });

    revalidateCounts(session.id);
    return { ok: true, data: { id: session.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateCountSessionAction(
  sessionId: string,
  raw: unknown,
): Promise<CountActionResult> {
  try {
    const input = updateCountSessionSchema.parse(raw);
    const context = await requirePermission("inventory.count.perform");
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase
      .from("count_sessions")
      .select("id, status")
      .eq("id", sessionId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!existing || existing.status !== "draft") {
      throw new AppError("VALIDATION", "Only draft counts can be edited.", 400);
    }

    if (input.locationIds) {
      for (const locationId of input.locationIds) {
        await requireLocationAccess(locationId);
      }
      await supabase.from("count_session_locations").delete().eq("count_session_id", sessionId);
      const { error: locError } = await supabase.from("count_session_locations").insert(
        input.locationIds.map((locationId) => ({
          organization_id: context.organizationId,
          count_session_id: sessionId,
          location_id: locationId,
        })),
      );
      if (locError) {
        throw new AppError("VALIDATION", mapCountDbError(locError.message), 400);
      }
    }

    const { error } = await supabase
      .from("count_sessions")
      .update({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.blindCountEnabled !== undefined
          ? { blind_count_enabled: input.blindCountEnabled }
          : {}),
      })
      .eq("id", sessionId)
      .eq("organization_id", context.organizationId)
      .eq("status", "draft");

    if (error) {
      throw new AppError("VALIDATION", mapCountDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_COUNT_UPDATED,
      entityType: "count_session",
      entityId: sessionId,
      summary: "Count session updated",
    });

    revalidateCounts(sessionId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelCountSessionAction(
  sessionId: string,
): Promise<CountActionResult> {
  try {
    const context = await requirePermission("inventory.count.perform");
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase
      .from("count_sessions")
      .select("id, status")
      .eq("id", sessionId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!existing || !["draft", "in_progress"].includes(existing.status)) {
      throw new AppError("VALIDATION", "Only draft or in-progress counts can be cancelled.", 400);
    }

    const { error } = await supabase
      .from("count_sessions")
      .update({ status: "cancelled" })
      .eq("id", sessionId)
      .eq("organization_id", context.organizationId);

    if (error) {
      throw new AppError("VALIDATION", mapCountDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_COUNT_CANCELLED,
      entityType: "count_session",
      entityId: sessionId,
      summary: "Count session cancelled",
    });

    revalidateCounts(sessionId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function startCountSessionAction(
  sessionId: string,
): Promise<CountActionResult> {
  try {
    const context = await requirePermission("inventory.count.perform");
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.rpc("start_count_session", {
      p_session_id: sessionId,
    });
    if (error) {
      throw new AppError("VALIDATION", mapCountDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_COUNT_STARTED,
      entityType: "count_session",
      entityId: sessionId,
      summary: "Count session started; expected quantities frozen",
    });

    revalidateCounts(sessionId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function recordCountLineAction(
  sessionId: string,
  lineId: string,
  raw: unknown,
): Promise<CountActionResult> {
  try {
    const input = recordCountLineSchema.parse(raw);
    const context = await requirePermission("inventory.count.perform");
    const supabase = await createServerSupabaseClient();

    const { data: line } = await supabase
      .from("count_lines")
      .select("id, location_id, count_session_id")
      .eq("id", lineId)
      .eq("count_session_id", sessionId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!line) {
      throw new AppError("NOT_FOUND", "Count line not found.", 404);
    }

    await requireLocationAccess(line.location_id);

    const { data: session } = await supabase
      .from("count_sessions")
      .select("status")
      .eq("id", sessionId)
      .maybeSingle();

    if (!session || session.status !== "in_progress") {
      throw new AppError("VALIDATION", "Counts can only be entered while in progress.", 400);
    }

    const { error } = await supabase
      .from("count_lines")
      .update({
        counted_quantity: input.countedQuantity,
        notes: input.notes ?? null,
        status: "counted",
        counted_by: context.userId,
        counted_at: new Date().toISOString(),
      })
      .eq("id", lineId)
      .eq("count_session_id", sessionId);

    if (error) {
      throw new AppError("VALIDATION", mapCountDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_COUNT_LINE_RECORDED,
      entityType: "count_line",
      entityId: lineId,
      summary: "Count line quantity recorded",
      metadata: { sessionId, countedQuantity: input.countedQuantity },
    });

    revalidateCounts(sessionId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function addCountLineAction(
  sessionId: string,
  raw: unknown,
): Promise<CountActionResult<{ id: string }>> {
  try {
    const input = addCountLineSchema.parse(raw);
    const context = await requirePermission("inventory.count.perform");
    const supabase = await createServerSupabaseClient();

    await requireLocationAccess(input.locationId);

    const { data: session } = await supabase
      .from("count_sessions")
      .select("status, organization_id")
      .eq("id", sessionId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!session || session.status !== "in_progress") {
      throw new AppError("VALIDATION", "Lines can only be added while the count is in progress.", 400);
    }

    const { data, error } = await supabase
      .from("count_lines")
      .insert({
        organization_id: context.organizationId,
        count_session_id: sessionId,
        item_id: input.itemId,
        variant_id: input.variantId ?? null,
        lot_id: input.lotId ?? null,
        location_id: input.locationId,
        storage_area_id: input.storageAreaId,
        bin_id: input.binId ?? null,
        expected_quantity: 0,
        counted_quantity: input.countedQuantity ?? null,
        status: input.countedQuantity === undefined ? "pending" : "counted",
        notes: input.notes ?? null,
        counted_by: input.countedQuantity === undefined ? null : context.userId,
        counted_at: input.countedQuantity === undefined ? null : new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new AppError("VALIDATION", mapCountDbError(error?.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_COUNT_LINE_ADDED,
      entityType: "count_line",
      entityId: data.id,
      summary: "Count line added",
      metadata: { sessionId, itemId: input.itemId },
    });

    revalidateCounts(sessionId);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function submitCountSessionAction(
  sessionId: string,
): Promise<CountActionResult> {
  try {
    const context = await requirePermission("inventory.count.perform");
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.rpc("submit_count_session_for_review", {
      p_session_id: sessionId,
    });
    if (error) {
      throw new AppError("VALIDATION", mapCountDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_COUNT_SUBMITTED,
      entityType: "count_session",
      entityId: sessionId,
      summary: "Count session submitted for review",
    });

    revalidateCounts(sessionId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function returnCountSessionAction(
  sessionId: string,
): Promise<CountActionResult> {
  try {
    const context = await requirePermission("inventory.count.review");
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.rpc("return_count_session_for_correction", {
      p_session_id: sessionId,
    });
    if (error) {
      throw new AppError("VALIDATION", mapCountDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_COUNT_RETURNED,
      entityType: "count_session",
      entityId: sessionId,
      summary: "Count session returned for correction",
    });

    revalidateCounts(sessionId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function reviewCountLineAction(
  sessionId: string,
  lineId: string,
  raw: unknown,
): Promise<CountActionResult> {
  try {
    const input = reviewCountLineSchema.parse(raw);
    const context = await requirePermission("inventory.count.review");
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.rpc("review_count_line", {
      p_line_id: lineId,
      p_decision: input.decision,
    });
    if (error) {
      throw new AppError("VALIDATION", mapCountDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_COUNT_LINE_REVIEWED,
      entityType: "count_line",
      entityId: lineId,
      summary: `Count line ${input.decision}`,
      metadata: { sessionId, decision: input.decision },
    });

    revalidateCounts(sessionId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function approveCountSessionAction(
  sessionId: string,
): Promise<CountActionResult> {
  try {
    const context = await requirePermission("inventory.count.review");
    await requirePermission("inventory.adjust");
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.rpc("approve_count_session_reconciliation", {
      p_session_id: sessionId,
    });
    if (error) {
      throw new AppError("VALIDATION", mapCountDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_COUNT_COMPLETED,
      entityType: "count_session",
      entityId: sessionId,
      summary: "Count reconciliation approved; adjustments posted to ledger",
    });

    revalidateCounts(sessionId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}
