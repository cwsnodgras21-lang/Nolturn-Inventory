"use server";

import { revalidatePath } from "next/cache";
import { requireLocationAccess, requirePermission } from "@/lib/auth";
import type { PermissionKey } from "@/lib/permissions/catalog";
import { AppError, toSafeErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AUDIT_ACTIONS, writeAuditEvent } from "@/modules/audit";
import { mapInventoryDbError } from "@/modules/inventory/mappers";
import {
  createInventoryTransactionSchema,
  reverseInventoryTransactionSchema,
  updateInventoryTransactionSchema,
  upsertInventoryLineSchema,
} from "@/modules/inventory/schemas";
import {
  permissionForTransactionType,
  type InventoryTransactionType,
} from "@/modules/inventory/types";

export type InventoryActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

function fail(error: unknown): InventoryActionResult<never> {
  if (error instanceof AppError) {
    return { ok: false, error: error.message, code: error.code };
  }
  return { ok: false, error: toSafeErrorMessage(error) };
}

function revalidateInventory(transactionId?: string) {
  revalidatePath("/inventory");
  revalidatePath("/inventory/stock");
  revalidatePath("/inventory/transactions");
  revalidatePath("/inventory/receive");
  revalidatePath("/inventory/consume");
  revalidatePath("/inventory/transfer");
  revalidatePath("/inventory/adjust");
  if (transactionId) {
    revalidatePath(`/inventory/transactions/${transactionId}`);
  }
}

async function resolveLineQuantities(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  organizationId: string,
  itemId: string,
  enteredUnitId: string,
  enteredQuantity: number,
) {
  const { data: item, error } = await supabase
    .from("items")
    .select("id, base_unit_id, requires_variant, organization_id")
    .eq("id", itemId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !item) {
    throw new AppError("NOT_FOUND", "Item not found.", 404);
  }

  let multiplier = 1;
  if (enteredUnitId !== item.base_unit_id) {
    const { data: conversion } = await supabase
      .from("item_unit_conversions")
      .select("multiplier")
      .eq("item_id", itemId)
      .eq("from_unit_id", enteredUnitId)
      .eq("to_unit_id", item.base_unit_id)
      .maybeSingle();

    if (!conversion) {
      throw new AppError(
        "VALIDATION",
        "No conversion exists from the entered unit to the item base unit.",
        400,
      );
    }
    multiplier = Number(conversion.multiplier);
  }

  return {
    item,
    multiplier,
    baseQuantity: enteredQuantity * multiplier,
  };
}

function completedAuditAction(type: InventoryTransactionType) {
  switch (type) {
    case "receipt":
      return AUDIT_ACTIONS.INVENTORY_RECEIPT_COMPLETED;
    case "consumption":
      return AUDIT_ACTIONS.INVENTORY_CONSUMPTION_COMPLETED;
    case "transfer":
      return AUDIT_ACTIONS.INVENTORY_TRANSFER_COMPLETED;
    case "negative_adjustment":
      return AUDIT_ACTIONS.INVENTORY_NEGATIVE_ADJUSTMENT_COMPLETED;
    default:
      return AUDIT_ACTIONS.INVENTORY_TRANSACTION_COMPLETED;
  }
}

export async function createInventoryTransactionAction(
  raw: unknown,
): Promise<InventoryActionResult<{ id: string }>> {
  try {
    const input = createInventoryTransactionSchema.parse(raw);
    if (
      input.transactionType === "negative_adjustment" &&
      (!input.notes || !input.notes.trim())
    ) {
      throw new AppError("VALIDATION", "Negative adjustments require a reason.", 400);
    }

    const permission = permissionForTransactionType(input.transactionType);
    const context = await requirePermission(permission as PermissionKey);
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("inventory_transactions")
      .insert({
        organization_id: context.organizationId,
        transaction_type: input.transactionType,
        status: "draft",
        notes: input.notes ?? null,
        reference_text: input.referenceText ?? null,
        created_by: context.userId,
        transaction_number: "",
      })
      .select("id, transaction_number")
      .single();

    if (error || !data) {
      throw new AppError("VALIDATION", mapInventoryDbError(error?.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_TRANSACTION_CREATED,
      entityType: "inventory_transaction",
      entityId: data.id,
      summary: `Inventory transaction created: ${data.transaction_number}`,
      metadata: { transactionType: input.transactionType },
    });

    revalidateInventory(data.id);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

/** @deprecated Prefer createInventoryTransactionAction */
export async function createAdjustmentAction(
  raw: unknown,
): Promise<InventoryActionResult<{ id: string }>> {
  return createInventoryTransactionAction(raw);
}

export async function updateInventoryTransactionAction(
  transactionId: string,
  raw: unknown,
): Promise<InventoryActionResult> {
  try {
    const input = updateInventoryTransactionSchema.parse(raw);
    const context = await requirePermission("inventory.read");
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase
      .from("inventory_transactions")
      .select("id, transaction_type, status")
      .eq("id", transactionId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!existing || existing.status !== "draft") {
      throw new AppError("VALIDATION", "Only draft transactions can be edited.", 400);
    }

    await requirePermission(
      permissionForTransactionType(existing.transaction_type as InventoryTransactionType),
    );

    if (
      existing.transaction_type === "negative_adjustment" &&
      input.notes !== undefined &&
      (!input.notes || !input.notes.trim())
    ) {
      throw new AppError("VALIDATION", "Negative adjustments require a reason.", 400);
    }

    const { error } = await supabase
      .from("inventory_transactions")
      .update({
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.referenceText !== undefined ? { reference_text: input.referenceText } : {}),
      })
      .eq("id", transactionId)
      .eq("organization_id", context.organizationId)
      .eq("status", "draft");

    if (error) {
      throw new AppError("VALIDATION", mapInventoryDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_TRANSACTION_UPDATED,
      entityType: "inventory_transaction",
      entityId: transactionId,
      summary: "Inventory transaction updated",
    });

    revalidateInventory(transactionId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function updateAdjustmentAction(
  transactionId: string,
  raw: unknown,
): Promise<InventoryActionResult> {
  return updateInventoryTransactionAction(transactionId, raw);
}

export async function cancelInventoryTransactionAction(
  transactionId: string,
): Promise<InventoryActionResult> {
  try {
    const context = await requirePermission("inventory.read");
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase
      .from("inventory_transactions")
      .select("id, transaction_type, status")
      .eq("id", transactionId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!existing || existing.status !== "draft") {
      throw new AppError("VALIDATION", "Only draft transactions can be cancelled.", 400);
    }

    await requirePermission(
      permissionForTransactionType(existing.transaction_type as InventoryTransactionType),
    );

    const { error } = await supabase
      .from("inventory_transactions")
      .update({ status: "cancelled" })
      .eq("id", transactionId)
      .eq("organization_id", context.organizationId)
      .eq("status", "draft");

    if (error) {
      throw new AppError("VALIDATION", mapInventoryDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_TRANSACTION_CANCELLED,
      entityType: "inventory_transaction",
      entityId: transactionId,
      summary: "Inventory transaction cancelled",
    });

    revalidateInventory(transactionId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelAdjustmentAction(
  transactionId: string,
): Promise<InventoryActionResult> {
  return cancelInventoryTransactionAction(transactionId);
}

export async function addInventoryLineAction(
  transactionId: string,
  raw: unknown,
): Promise<InventoryActionResult<{ id: string }>> {
  try {
    const input = upsertInventoryLineSchema.parse(raw);
    const context = await requirePermission("inventory.read");
    const supabase = await createServerSupabaseClient();

    const { data: txn } = await supabase
      .from("inventory_transactions")
      .select("id, status, transaction_type")
      .eq("id", transactionId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!txn || txn.status !== "draft") {
      throw new AppError("VALIDATION", "Only draft transactions can be edited.", 400);
    }

    const txnType = txn.transaction_type as InventoryTransactionType;
    await requirePermission(permissionForTransactionType(txnType));

    if (input.sourceLocationId) {
      await requireLocationAccess(input.sourceLocationId);
    }
    if (input.destinationLocationId) {
      await requireLocationAccess(input.destinationLocationId);
    }

    const { item, multiplier, baseQuantity } = await resolveLineQuantities(
      supabase,
      context.organizationId,
      input.itemId,
      input.enteredUnitId,
      input.enteredQuantity,
    );

    if (item.requires_variant && !input.variantId) {
      throw new AppError("VALIDATION", "This item requires a variant.", 400);
    }

    const { data: existingLines } = await supabase
      .from("inventory_transaction_lines")
      .select("line_number")
      .eq("transaction_id", transactionId)
      .order("line_number", { ascending: false })
      .limit(1);

    const nextLine = (existingLines?.[0]?.line_number ?? 0) + 1;

    const { data, error } = await supabase
      .from("inventory_transaction_lines")
      .insert({
        organization_id: context.organizationId,
        transaction_id: transactionId,
        line_number: nextLine,
        item_id: input.itemId,
        variant_id: input.variantId ?? null,
        entered_quantity: input.enteredQuantity,
        entered_unit_id: input.enteredUnitId,
        conversion_multiplier: multiplier,
        base_quantity: baseQuantity,
        destination_location_id: input.destinationLocationId ?? null,
        destination_storage_area_id: input.destinationStorageAreaId ?? null,
        destination_bin_id: input.destinationBinId ?? null,
        source_location_id: input.sourceLocationId ?? null,
        source_storage_area_id: input.sourceStorageAreaId ?? null,
        source_bin_id: input.sourceBinId ?? null,
        lot_id: input.lotId ?? null,
        unit_cost: input.unitCost ?? null,
        notes: input.notes ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new AppError("VALIDATION", mapInventoryDbError(error?.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_TRANSACTION_LINE_ADDED,
      entityType: "inventory_transaction_line",
      entityId: data.id,
      summary: "Inventory transaction line added",
      metadata: { transactionId, itemId: input.itemId, baseQuantity, transactionType: txnType },
    });

    revalidateInventory(transactionId);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function addAdjustmentLineAction(
  transactionId: string,
  raw: unknown,
): Promise<InventoryActionResult<{ id: string }>> {
  return addInventoryLineAction(transactionId, raw);
}

export async function removeInventoryLineAction(
  transactionId: string,
  lineId: string,
): Promise<InventoryActionResult> {
  try {
    const context = await requirePermission("inventory.read");
    const supabase = await createServerSupabaseClient();

    const { data: txn } = await supabase
      .from("inventory_transactions")
      .select("transaction_type, status")
      .eq("id", transactionId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!txn || txn.status !== "draft") {
      throw new AppError("VALIDATION", "Only draft transactions can be edited.", 400);
    }

    await requirePermission(
      permissionForTransactionType(txn.transaction_type as InventoryTransactionType),
    );

    const { error } = await supabase
      .from("inventory_transaction_lines")
      .delete()
      .eq("id", lineId)
      .eq("transaction_id", transactionId)
      .eq("organization_id", context.organizationId);

    if (error) {
      throw new AppError("VALIDATION", mapInventoryDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_TRANSACTION_LINE_REMOVED,
      entityType: "inventory_transaction_line",
      entityId: lineId,
      summary: "Inventory transaction line removed",
      metadata: { transactionId },
    });

    revalidateInventory(transactionId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function removeAdjustmentLineAction(
  transactionId: string,
  lineId: string,
): Promise<InventoryActionResult> {
  return removeInventoryLineAction(transactionId, lineId);
}

export async function completeInventoryTransactionAction(
  transactionId: string,
): Promise<InventoryActionResult> {
  try {
    const context = await requirePermission("inventory.read");
    const supabase = await createServerSupabaseClient();

    const { data: txn } = await supabase
      .from("inventory_transactions")
      .select("id, transaction_type, status, notes")
      .eq("id", transactionId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!txn || txn.status !== "draft") {
      throw new AppError("VALIDATION", "Only draft transactions can be completed.", 400);
    }

    const txnType = txn.transaction_type as InventoryTransactionType;
    await requirePermission(permissionForTransactionType(txnType));

    if (txnType === "negative_adjustment" && (!txn.notes || !txn.notes.trim())) {
      throw new AppError("VALIDATION", "Negative adjustments require a reason.", 400);
    }

    const { data: lines } = await supabase
      .from("inventory_transaction_lines")
      .select("source_location_id, destination_location_id")
      .eq("transaction_id", transactionId)
      .eq("organization_id", context.organizationId);

    for (const line of lines ?? []) {
      if (line.source_location_id) {
        await requireLocationAccess(line.source_location_id);
      }
      if (line.destination_location_id) {
        await requireLocationAccess(line.destination_location_id);
      }
    }

    const { data, error } = await supabase.rpc("complete_inventory_transaction", {
      p_transaction_id: transactionId,
    });

    if (error) {
      throw new AppError("VALIDATION", mapInventoryDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: completedAuditAction(txnType),
      entityType: "inventory_transaction",
      entityId: transactionId,
      summary: `Inventory transaction completed (${txnType})`,
      metadata: {
        transactionType: txnType,
        transactionNumber:
          data && typeof data === "object" && "transaction_number" in data
            ? (data as { transaction_number?: string }).transaction_number
            : undefined,
      },
    });

    revalidateInventory(transactionId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function completeAdjustmentAction(
  transactionId: string,
): Promise<InventoryActionResult> {
  return completeInventoryTransactionAction(transactionId);
}

export async function reverseInventoryTransactionAction(
  transactionId: string,
  raw: unknown,
): Promise<InventoryActionResult<{ id: string }>> {
  try {
    const input = reverseInventoryTransactionSchema.parse(raw);
    const context = await requirePermission("inventory.reverse");
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase
      .from("inventory_transactions")
      .select(
        "id, transaction_type, status, reversed_by_transaction_id, transaction_number",
      )
      .eq("id", transactionId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!existing) {
      throw new AppError("NOT_FOUND", "Transaction not found.", 404);
    }

    if (existing.transaction_type === "reversal") {
      throw new AppError("VALIDATION", "Reversal transactions cannot be reversed.", 400);
    }

    if (existing.status !== "completed" || existing.reversed_by_transaction_id) {
      throw new AppError(
        "VALIDATION",
        existing.reversed_by_transaction_id
          ? "This transaction has already been reversed."
          : "Only completed transactions can be reversed.",
        400,
      );
    }

    const { data: ledgerLocations } = await supabase
      .from("inventory_ledger_entries")
      .select("location_id")
      .eq("transaction_id", transactionId)
      .eq("organization_id", context.organizationId);

    const uniqueLocations = [
      ...new Set((ledgerLocations ?? []).map((row) => row.location_id).filter(Boolean)),
    ];
    for (const locationId of uniqueLocations) {
      await requireLocationAccess(locationId);
    }

    const { data, error } = await supabase.rpc("reverse_inventory_transaction", {
      p_transaction_id: transactionId,
      p_reason: input.reason,
    });

    if (error) {
      throw new AppError("VALIDATION", mapInventoryDbError(error.message), 400);
    }

    const reversalId =
      data && typeof data === "object" && "id" in data
        ? String((data as { id: string }).id)
        : "";

    if (!reversalId) {
      throw new AppError("INTERNAL", "Reversal did not return a transaction id.", 500);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_TRANSACTION_REVERSED,
      entityType: "inventory_transaction",
      entityId: transactionId,
      summary: `Inventory transaction reversed: ${existing.transaction_number}`,
      metadata: {
        originalTransactionId: transactionId,
        reversalTransactionId: reversalId,
        reason: input.reason,
      },
    });

    revalidateInventory(transactionId);
    revalidateInventory(reversalId);
    return { ok: true, data: { id: reversalId } };
  } catch (error) {
    return fail(error);
  }
}
