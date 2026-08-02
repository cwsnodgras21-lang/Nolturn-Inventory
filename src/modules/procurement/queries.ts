import "server-only";

import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  mapPurchaseOrder,
  mapPurchaseOrderLine,
  mapPurchaseOrderReceipt,
} from "@/modules/procurement/mappers";
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderReceipt,
  PurchaseOrderStatus,
} from "@/modules/procurement/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function listPurchaseOrders(options?: {
  status?: PurchaseOrderStatus | "all";
  supplierId?: string;
  locationId?: string;
}): Promise<PurchaseOrder[]> {
  const context = await requirePermission("purchasing.read");
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("purchase_orders")
    .select(
      `id, organization_id, supplier_id, po_number, status, order_date, expected_date,
      ship_to_location_id, external_reference, notes, created_by, submitted_by, submitted_at,
      cancelled_by, cancelled_at, created_at, updated_at,
      suppliers(name), locations!purchase_orders_ship_to_location_id_fkey(name)`,
    )
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false });

  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }
  if (options?.supplierId) {
    query = query.eq("supplier_id", options.supplierId);
  }
  if (options?.locationId) {
    query = query.eq("ship_to_location_id", options.locationId);
  }

  const { data, error } = await query;
  if (error) throw new AppError("INTERNAL", "Unable to load purchase orders.", 500);
  return (data ?? []).map((row) =>
    mapPurchaseOrder(row as unknown as Parameters<typeof mapPurchaseOrder>[0]),
  );
}

export async function getPurchaseOrder(orderId: string): Promise<PurchaseOrder> {
  if (!UUID_RE.test(orderId)) {
    throw new AppError("NOT_FOUND", "Purchase order not found.", 404);
  }
  const context = await requirePermission("purchasing.read");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      `id, organization_id, supplier_id, po_number, status, order_date, expected_date,
      ship_to_location_id, external_reference, notes, created_by, submitted_by, submitted_at,
      cancelled_by, cancelled_at, created_at, updated_at,
      suppliers(name), locations!purchase_orders_ship_to_location_id_fkey(name)`,
    )
    .eq("organization_id", context.organizationId)
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new AppError("INTERNAL", "Unable to load purchase order.", 500);
  if (!data) throw new AppError("NOT_FOUND", "Purchase order not found.", 404);
  return mapPurchaseOrder(data as unknown as Parameters<typeof mapPurchaseOrder>[0]);
}

export async function listPurchaseOrderLines(orderId: string): Promise<PurchaseOrderLine[]> {
  await getPurchaseOrder(orderId);
  const context = await requirePermission("purchasing.read");
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("purchase_order_lines")
    .select(
      `id, organization_id, purchase_order_id, line_number, item_id, variant_id,
      ordered_quantity, purchase_unit_id, conversion_multiplier, unit_cost,
      received_quantity, remaining_quantity, notes, created_at, updated_at,
      items(name, sku), item_variants(name),
      units_of_measure!purchase_order_lines_purchase_unit_id_fkey(symbol)`,
    )
    .eq("organization_id", context.organizationId)
    .eq("purchase_order_id", orderId)
    .order("line_number", { ascending: true });

  if (error) throw new AppError("INTERNAL", "Unable to load purchase order lines.", 500);
  return (data ?? []).map((row) =>
    mapPurchaseOrderLine(row as unknown as Parameters<typeof mapPurchaseOrderLine>[0]),
  );
}

export async function listPurchaseOrderReceipts(orderId: string): Promise<PurchaseOrderReceipt[]> {
  await getPurchaseOrder(orderId);
  const context = await requirePermission("purchasing.read");
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("inventory_transactions")
    .select("id, transaction_number, status, completed_at, notes, reference_text")
    .eq("organization_id", context.organizationId)
    .eq("purchase_order_id", orderId)
    .eq("transaction_type", "receipt")
    .order("completed_at", { ascending: false });

  if (error) throw new AppError("INTERNAL", "Unable to load purchase order receipts.", 500);
  return (data ?? []).map(mapPurchaseOrderReceipt);
}
