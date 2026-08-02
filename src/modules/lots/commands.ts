"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { AppError, toSafeErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AUDIT_ACTIONS, writeAuditEvent } from "@/modules/audit";
import { mapLotDbError } from "@/modules/lots/mappers";
import {
  createLotSchema,
  updateItemTrackingModeSchema,
  updateLotSchema,
} from "@/modules/lots/schemas";

export type LotActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

function fail(error: unknown): LotActionResult<never> {
  if (error instanceof AppError) {
    return { ok: false, error: error.message, code: error.code };
  }
  return { ok: false, error: toSafeErrorMessage(error) };
}

function revalidateLots(itemId?: string) {
  revalidatePath("/inventory");
  revalidatePath("/inventory/stock");
  revalidatePath("/inventory/lots");
  if (itemId) {
    revalidatePath(`/administration/catalog/items/${itemId}`);
  }
}

export async function createLotAction(
  raw: unknown,
): Promise<LotActionResult<{ id: string }>> {
  try {
    const input = createLotSchema.parse(raw);
    const context = await requirePermission("inventory.lots.manage");
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("inventory_lots")
      .insert({
        organization_id: context.organizationId,
        item_id: input.itemId,
        variant_id: input.variantId ?? null,
        lot_number: input.lotNumber,
        expiration_date: input.expirationDate || null,
        notes: input.notes?.trim() || null,
        status: input.status,
        created_by: context.userId,
      })
      .select("id, lot_number")
      .single();

    if (error || !data) {
      throw new AppError("VALIDATION", mapLotDbError(error?.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_LOT_CREATED,
      entityType: "inventory_lot",
      entityId: data.id,
      summary: `Lot created: ${data.lot_number}`,
      metadata: { itemId: input.itemId },
    });

    revalidateLots(input.itemId);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateLotAction(
  lotId: string,
  raw: unknown,
): Promise<LotActionResult> {
  try {
    const input = updateLotSchema.parse(raw);
    const context = await requirePermission("inventory.lots.manage");
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase
      .from("inventory_lots")
      .select("id, item_id, status")
      .eq("id", lotId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!existing) throw new AppError("NOT_FOUND", "Lot not found.", 404);

    const { error } = await supabase
      .from("inventory_lots")
      .update({
        ...(input.lotNumber !== undefined ? { lot_number: input.lotNumber } : {}),
        ...(input.expirationDate !== undefined
          ? { expiration_date: input.expirationDate || null }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      })
      .eq("id", lotId);

    if (error) {
      throw new AppError("VALIDATION", mapLotDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action:
        input.status && input.status !== existing.status
          ? AUDIT_ACTIONS.INVENTORY_LOT_STATUS_CHANGED
          : AUDIT_ACTIONS.INVENTORY_LOT_UPDATED,
      entityType: "inventory_lot",
      entityId: lotId,
      summary: "Lot updated",
      metadata: input as Record<string, unknown>,
    });

    revalidateLots(existing.item_id);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function updateItemTrackingModeAction(
  itemId: string,
  raw: unknown,
): Promise<LotActionResult> {
  try {
    const input = updateItemTrackingModeSchema.parse(raw);
    const context = await requirePermission("inventory.lots.manage");
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from("items")
      .update({ tracking_mode: input.trackingMode })
      .eq("id", itemId)
      .eq("organization_id", context.organizationId);

    if (error) {
      throw new AppError("VALIDATION", mapLotDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_ITEM_TRACKING_MODE_CHANGED,
      entityType: "item",
      entityId: itemId,
      summary: `Item tracking mode set to ${input.trackingMode}`,
    });

    revalidateLots(itemId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}
