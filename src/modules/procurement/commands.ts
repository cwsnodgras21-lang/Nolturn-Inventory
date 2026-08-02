"use server";

import { revalidatePath } from "next/cache";
import { requireLocationAccess, requirePermission } from "@/lib/auth";
import { AppError, toSafeErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AUDIT_ACTIONS, writeAuditEvent } from "@/modules/audit";
import { mapPurchaseOrderDbError } from "@/modules/procurement/mappers";
import {
  createPurchaseOrderSchema,
  receivePurchaseOrderSchema,
  updatePurchaseOrderSchema,
  upsertPurchaseOrderLineSchema,
} from "@/modules/procurement/schemas";

export type PurchaseOrderActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

function fail(error: unknown): PurchaseOrderActionResult<never> {
  if (error instanceof AppError) {
    return { ok: false, error: error.message, code: error.code };
  }
  return { ok: false, error: toSafeErrorMessage(error) };
}

function revalidateOrders(orderId?: string) {
  revalidatePath("/purchasing");
  revalidatePath("/purchasing/orders");
  revalidatePath("/inventory");
  revalidatePath("/inventory/stock");
  revalidatePath("/inventory/transactions");
  if (orderId) revalidatePath(`/purchasing/orders/${orderId}`);
}

export async function createPurchaseOrderAction(
  raw: unknown,
): Promise<PurchaseOrderActionResult<{ id: string }>> {
  try {
    const input = createPurchaseOrderSchema.parse(raw);
    const context = await requirePermission("purchasing.manage");
    await requireLocationAccess(input.shipToLocationId);
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("purchase_orders")
      .insert({
        organization_id: context.organizationId,
        supplier_id: input.supplierId,
        ship_to_location_id: input.shipToLocationId,
        order_date: input.orderDate,
        expected_date: input.expectedDate || null,
        external_reference: input.externalReference?.trim() || null,
        notes: input.notes?.trim() || null,
        status: "draft",
        po_number: "",
        created_by: context.userId,
      })
      .select("id, po_number")
      .single();

    if (error || !data) {
      throw new AppError("VALIDATION", mapPurchaseOrderDbError(error?.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.PURCHASING_PO_CREATED,
      entityType: "purchase_order",
      entityId: data.id,
      summary: `Purchase order created: ${data.po_number}`,
    });

    revalidateOrders(data.id);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updatePurchaseOrderAction(
  orderId: string,
  raw: unknown,
): Promise<PurchaseOrderActionResult> {
  try {
    const input = updatePurchaseOrderSchema.parse(raw);
    const context = await requirePermission("purchasing.manage");
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase
      .from("purchase_orders")
      .select("id, status, ship_to_location_id")
      .eq("id", orderId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!existing) throw new AppError("NOT_FOUND", "Purchase order not found.", 404);
    if (existing.status !== "draft") {
      throw new AppError("VALIDATION", "Only draft purchase orders can be fully edited.", 400);
    }

    if (input.shipToLocationId) {
      await requireLocationAccess(input.shipToLocationId);
    } else {
      await requireLocationAccess(existing.ship_to_location_id);
    }

    const { error } = await supabase
      .from("purchase_orders")
      .update({
        ...(input.supplierId !== undefined ? { supplier_id: input.supplierId } : {}),
        ...(input.shipToLocationId !== undefined
          ? { ship_to_location_id: input.shipToLocationId }
          : {}),
        ...(input.orderDate !== undefined ? { order_date: input.orderDate } : {}),
        ...(input.expectedDate !== undefined
          ? { expected_date: input.expectedDate || null }
          : {}),
        ...(input.externalReference !== undefined
          ? { external_reference: input.externalReference?.trim() || null }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      })
      .eq("id", orderId);

    if (error) {
      throw new AppError("VALIDATION", mapPurchaseOrderDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.PURCHASING_PO_UPDATED,
      entityType: "purchase_order",
      entityId: orderId,
      summary: "Purchase order updated",
    });

    revalidateOrders(orderId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function addPurchaseOrderLineAction(
  orderId: string,
  raw: unknown,
): Promise<PurchaseOrderActionResult<{ id: string }>> {
  try {
    const input = upsertPurchaseOrderLineSchema.parse(raw);
    const context = await requirePermission("purchasing.manage");
    const supabase = await createServerSupabaseClient();

    const { data: order } = await supabase
      .from("purchase_orders")
      .select("id, status, ship_to_location_id")
      .eq("id", orderId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!order || order.status !== "draft") {
      throw new AppError("VALIDATION", "Lines can only be added to draft orders.", 400);
    }
    await requireLocationAccess(order.ship_to_location_id);

    const { data: existingLines } = await supabase
      .from("purchase_order_lines")
      .select("line_number")
      .eq("purchase_order_id", orderId)
      .order("line_number", { ascending: false })
      .limit(1);

    const lineNumber = (existingLines?.[0]?.line_number ?? 0) + 1;

    const { data, error } = await supabase
      .from("purchase_order_lines")
      .insert({
        organization_id: context.organizationId,
        purchase_order_id: orderId,
        line_number: lineNumber,
        item_id: input.itemId,
        variant_id: input.variantId ?? null,
        ordered_quantity: input.orderedQuantity,
        purchase_unit_id: input.purchaseUnitId,
        unit_cost: input.unitCost ?? null,
        notes: input.notes?.trim() || null,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new AppError("VALIDATION", mapPurchaseOrderDbError(error?.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.PURCHASING_PO_LINE_ADDED,
      entityType: "purchase_order_line",
      entityId: data.id,
      summary: "Purchase order line added",
      metadata: { purchaseOrderId: orderId, lineNumber },
    });

    revalidateOrders(orderId);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function removePurchaseOrderLineAction(
  orderId: string,
  lineId: string,
): Promise<PurchaseOrderActionResult> {
  try {
    const context = await requirePermission("purchasing.manage");
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from("purchase_order_lines")
      .delete()
      .eq("id", lineId)
      .eq("purchase_order_id", orderId)
      .eq("organization_id", context.organizationId);

    if (error) {
      throw new AppError("VALIDATION", mapPurchaseOrderDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.PURCHASING_PO_LINE_REMOVED,
      entityType: "purchase_order_line",
      entityId: lineId,
      summary: "Purchase order line removed",
      metadata: { purchaseOrderId: orderId },
    });

    revalidateOrders(orderId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function submitPurchaseOrderAction(
  orderId: string,
): Promise<PurchaseOrderActionResult> {
  try {
    const context = await requirePermission("purchasing.manage");
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.rpc("submit_purchase_order", {
      p_purchase_order_id: orderId,
    });
    if (error) {
      throw new AppError("VALIDATION", mapPurchaseOrderDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.PURCHASING_PO_SUBMITTED,
      entityType: "purchase_order",
      entityId: orderId,
      summary: "Purchase order submitted",
    });

    revalidateOrders(orderId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelPurchaseOrderAction(
  orderId: string,
): Promise<PurchaseOrderActionResult> {
  try {
    const context = await requirePermission("purchasing.manage");
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.rpc("cancel_purchase_order", {
      p_purchase_order_id: orderId,
    });
    if (error) {
      throw new AppError("VALIDATION", mapPurchaseOrderDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.PURCHASING_PO_CANCELLED,
      entityType: "purchase_order",
      entityId: orderId,
      summary: "Purchase order cancelled",
    });

    revalidateOrders(orderId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function receivePurchaseOrderAction(
  orderId: string,
  raw: unknown,
): Promise<PurchaseOrderActionResult<{ transactionId: string }>> {
  try {
    const input = receivePurchaseOrderSchema.parse(raw);
    const context = await requirePermission("purchasing.receive");
    const supabase = await createServerSupabaseClient();

    for (const line of input.lines) {
      await requireLocationAccess(line.destinationLocationId);
    }

    const { data, error } = await supabase.rpc("receive_purchase_order", {
      p_purchase_order_id: orderId,
      p_lines: input.lines.map((line) => ({
        purchase_order_line_id: line.purchaseOrderLineId,
        quantity: line.quantity,
        destination_location_id: line.destinationLocationId,
        destination_storage_area_id: line.destinationStorageAreaId,
        destination_bin_id: line.destinationBinId ?? null,
        unit_cost: line.unitCost ?? null,
      })),
      p_notes: input.notes ?? null,
      p_reference_text: input.referenceText ?? null,
    });

    if (error || !data) {
      throw new AppError("VALIDATION", mapPurchaseOrderDbError(error?.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.PURCHASING_PO_RECEIVED,
      entityType: "purchase_order",
      entityId: orderId,
      summary: "Purchase order receipt posted",
      metadata: {
        transactionId: data.id,
        lineCount: input.lines.length,
      },
    });

    revalidateOrders(orderId);
    return { ok: true, data: { transactionId: data.id } };
  } catch (error) {
    return fail(error);
  }
}
