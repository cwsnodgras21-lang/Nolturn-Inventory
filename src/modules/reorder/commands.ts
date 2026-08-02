"use server";

import { revalidatePath } from "next/cache";
import { requireLocationAccess, requirePermission } from "@/lib/auth";
import { AppError, toSafeErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AUDIT_ACTIONS, writeAuditEvent } from "@/modules/audit";
import { mapReorderDbError } from "@/modules/reorder/mappers";
import {
  createRestockDraftOrdersSchema,
  updateReorderRuleSchema,
  upsertReorderRuleSchema,
} from "@/modules/reorder/schemas";

export type ReorderActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

function fail(error: unknown): ReorderActionResult<never> {
  if (error instanceof AppError) {
    return { ok: false, error: error.message, code: error.code };
  }
  return { ok: false, error: toSafeErrorMessage(error) };
}

function revalidateReorder(itemId?: string) {
  revalidatePath("/inventory");
  revalidatePath("/inventory/restock");
  revalidatePath("/purchasing/orders");
  if (itemId) revalidatePath(`/administration/catalog/items/${itemId}`);
}

export async function upsertReorderRuleAction(
  raw: unknown,
): Promise<ReorderActionResult<{ id: string }>> {
  try {
    const input = upsertReorderRuleSchema.parse(raw);
    const context = await requirePermission("inventory.reorder.manage");
    if (input.locationId) {
      await requireLocationAccess(input.locationId);
    }
    const supabase = await createServerSupabaseClient();

    let existingQuery = supabase
      .from("reorder_rules")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("item_id", input.itemId);
    existingQuery =
      input.variantId == null
        ? existingQuery.is("variant_id", null)
        : existingQuery.eq("variant_id", input.variantId);
    existingQuery =
      input.locationId == null
        ? existingQuery.is("location_id", null)
        : existingQuery.eq("location_id", input.locationId);

    const { data: existing } = await existingQuery.maybeSingle();

    const payload = {
      minimum_quantity: input.minimumQuantity,
      target_quantity: input.targetQuantity,
      reorder_quantity: input.reorderQuantity ?? null,
      preferred_supplier_id: input.preferredSupplierId ?? null,
      status: input.status,
      notes: input.notes?.trim() || null,
    };

    let data: { id: string } | null = null;
    let error: { message: string } | null = null;

    if (existing) {
      const updated = await supabase
        .from("reorder_rules")
        .update(payload)
        .eq("id", existing.id)
        .select("id")
        .single();
      data = updated.data;
      error = updated.error;
    } else {
      const inserted = await supabase
        .from("reorder_rules")
        .insert({
          organization_id: context.organizationId,
          item_id: input.itemId,
          variant_id: input.variantId ?? null,
          location_id: input.locationId ?? null,
          created_by: context.userId,
          ...payload,
        })
        .select("id")
        .single();
      data = inserted.data;
      error = inserted.error;
    }

    if (error || !data) {
      throw new AppError("VALIDATION", mapReorderDbError(error?.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_REORDER_RULE_UPSERTED,
      entityType: "reorder_rule",
      entityId: data.id,
      summary: "Reorder rule saved",
      metadata: {
        itemId: input.itemId,
        variantId: input.variantId ?? null,
        locationId: input.locationId ?? null,
        minimumQuantity: input.minimumQuantity,
        targetQuantity: input.targetQuantity,
      },
    });

    revalidateReorder(input.itemId);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateReorderRuleAction(
  ruleId: string,
  raw: unknown,
): Promise<ReorderActionResult> {
  try {
    const input = updateReorderRuleSchema.parse(raw);
    const context = await requirePermission("inventory.reorder.manage");
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase
      .from("reorder_rules")
      .select("id, item_id, location_id, minimum_quantity, target_quantity")
      .eq("id", ruleId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!existing) throw new AppError("NOT_FOUND", "Reorder rule not found.", 404);
    if (existing.location_id) {
      await requireLocationAccess(existing.location_id);
    }

    const nextMinimum =
      input.minimumQuantity !== undefined
        ? input.minimumQuantity
        : Number(existing.minimum_quantity);
    const nextTarget =
      input.targetQuantity !== undefined
        ? input.targetQuantity
        : Number(existing.target_quantity);
    if (nextTarget < nextMinimum) {
      throw new AppError(
        "VALIDATION",
        "Target quantity must be greater than or equal to minimum quantity.",
        400,
      );
    }

    const { error } = await supabase
      .from("reorder_rules")
      .update({
        ...(input.minimumQuantity !== undefined
          ? { minimum_quantity: input.minimumQuantity }
          : {}),
        ...(input.targetQuantity !== undefined
          ? { target_quantity: input.targetQuantity }
          : {}),
        ...(input.reorderQuantity !== undefined
          ? { reorder_quantity: input.reorderQuantity }
          : {}),
        ...(input.preferredSupplierId !== undefined
          ? { preferred_supplier_id: input.preferredSupplierId }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      })
      .eq("id", ruleId);

    if (error) throw new AppError("VALIDATION", mapReorderDbError(error.message), 400);

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_REORDER_RULE_UPDATED,
      entityType: "reorder_rule",
      entityId: ruleId,
      summary: "Reorder rule updated",
      metadata: input as Record<string, unknown>,
    });

    revalidateReorder(existing.item_id);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteReorderRuleAction(
  ruleId: string,
): Promise<ReorderActionResult> {
  try {
    const context = await requirePermission("inventory.reorder.manage");
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase
      .from("reorder_rules")
      .select("id, item_id, location_id")
      .eq("id", ruleId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!existing) throw new AppError("NOT_FOUND", "Reorder rule not found.", 404);
    if (existing.location_id) {
      await requireLocationAccess(existing.location_id);
    }

    const { error } = await supabase.from("reorder_rules").delete().eq("id", ruleId);
    if (error) throw new AppError("VALIDATION", mapReorderDbError(error.message), 400);

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_REORDER_RULE_DELETED,
      entityType: "reorder_rule",
      entityId: ruleId,
      summary: "Reorder rule deleted",
    });

    revalidateReorder(existing.item_id);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function createRestockDraftPurchaseOrdersAction(
  raw: unknown,
): Promise<ReorderActionResult<{ purchaseOrderIds: string[]; reused: boolean }>> {
  try {
    const input = createRestockDraftOrdersSchema.parse(raw);
    const context = await requirePermission("inventory.reorder.manage");
    if (!context.permissionKeys.includes("purchasing.manage")) {
      throw new AppError(
        "PERMISSION_DENIED",
        "Purchasing manage permission is required to create draft purchase orders.",
        403,
      );
    }

    for (const selection of input.selections) {
      await requireLocationAccess(selection.locationId);
    }

    const supabase = await createServerSupabaseClient();

    // Idempotency: try insert request key
    const { data: requestRow, error: requestError } = await supabase
      .from("restock_plan_requests")
      .insert({
        organization_id: context.organizationId,
        request_key: input.requestKey,
        created_by: context.userId,
      })
      .select("id")
      .maybeSingle();

    if (requestError) {
      const isConflict =
        requestError.code === "23505" ||
        requestError.message?.includes("restock_plan_requests_org_key_uidx") ||
        requestError.message?.includes("duplicate key");

      if (!isConflict) {
        throw new AppError("VALIDATION", mapReorderDbError(requestError.message), 400);
      }

      const { data: existing } = await supabase
        .from("restock_plan_requests")
        .select("id")
        .eq("organization_id", context.organizationId)
        .eq("request_key", input.requestKey)
        .maybeSingle();

      if (!existing) {
        throw new AppError("VALIDATION", "Unable to resolve restock request.", 400);
      }

      const { data: linked } = await supabase
        .from("restock_plan_request_orders")
        .select("purchase_order_id")
        .eq("request_id", existing.id);

      const purchaseOrderIds = (linked ?? []).map((row) => row.purchase_order_id);
      return { ok: true, data: { purchaseOrderIds, reused: true } };
    }

    if (!requestRow) {
      throw new AppError("VALIDATION", "Unable to create restock request.", 400);
    }

    // Group by supplier + ship-to location
    const groups = new Map<
      string,
      {
        supplierId: string;
        locationId: string;
        lines: Array<{
          itemId: string;
          variantId: string | null;
          orderedQuantity: number;
          purchaseUnitId: string;
        }>;
      }
    >();

    for (const selection of input.selections) {
      const groupKey = `${selection.supplierId}|${selection.locationId}`;
      const group = groups.get(groupKey) ?? {
        supplierId: selection.supplierId,
        locationId: selection.locationId,
        lines: [],
      };
      group.lines.push({
        itemId: selection.itemId,
        variantId: selection.variantId ?? null,
        orderedQuantity: selection.suggestedQuantity,
        purchaseUnitId: selection.purchaseUnitId,
      });
      groups.set(groupKey, group);
    }

    const orderDate = new Date().toISOString().slice(0, 10);
    const purchaseOrderIds: string[] = [];

    for (const group of groups.values()) {
      const { data: order, error: orderError } = await supabase
        .from("purchase_orders")
        .insert({
          organization_id: context.organizationId,
          supplier_id: group.supplierId,
          ship_to_location_id: group.locationId,
          order_date: orderDate,
          notes: "Created from restock planning",
          status: "draft",
          po_number: "",
          created_by: context.userId,
        })
        .select("id, po_number")
        .single();

      if (orderError || !order) {
        throw new AppError("VALIDATION", mapReorderDbError(orderError?.message), 400);
      }

      let lineNumber = 1;
      for (const line of group.lines) {
        const { error: lineError } = await supabase.from("purchase_order_lines").insert({
          organization_id: context.organizationId,
          purchase_order_id: order.id,
          line_number: lineNumber,
          item_id: line.itemId,
          variant_id: line.variantId,
          ordered_quantity: line.orderedQuantity,
          purchase_unit_id: line.purchaseUnitId,
          notes: "Restock suggestion",
        });
        if (lineError) {
          throw new AppError("VALIDATION", mapReorderDbError(lineError.message), 400);
        }
        lineNumber += 1;
      }

      const { error: linkError } = await supabase.from("restock_plan_request_orders").insert({
        organization_id: context.organizationId,
        request_id: requestRow.id,
        purchase_order_id: order.id,
      });
      if (linkError) {
        throw new AppError("VALIDATION", mapReorderDbError(linkError.message), 400);
      }

      purchaseOrderIds.push(order.id);

      await writeAuditEvent({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: AUDIT_ACTIONS.PURCHASING_PO_CREATED,
        entityType: "purchase_order",
        entityId: order.id,
        summary: `Draft PO from restock plan: ${order.po_number}`,
        metadata: { restockRequestId: requestRow.id, requestKey: input.requestKey },
      });
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_RESTOCK_DRAFT_POS_CREATED,
      entityType: "restock_plan_request",
      entityId: requestRow.id,
      summary: `Created ${purchaseOrderIds.length} draft PO(s) from restock plan`,
      metadata: {
        requestKey: input.requestKey,
        purchaseOrderIds,
        selectionCount: input.selections.length,
      },
    });

    revalidateReorder();
    return { ok: true, data: { purchaseOrderIds, reused: false } };
  } catch (error) {
    return fail(error);
  }
}
