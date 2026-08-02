import type {
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderReceipt,
  PurchaseOrderStatus,
} from "@/modules/procurement/types";

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function mapPurchaseOrder(row: {
  id: string;
  organization_id: string;
  supplier_id: string;
  po_number: string;
  status: string;
  order_date: string;
  expected_date: string | null;
  ship_to_location_id: string;
  external_reference: string | null;
  notes: string | null;
  created_by: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  suppliers?: { name: string } | { name: string }[] | null;
  locations?: { name: string } | { name: string }[] | null;
}): PurchaseOrder {
  return {
    id: row.id,
    organizationId: row.organization_id,
    supplierId: row.supplier_id,
    poNumber: row.po_number,
    status: row.status as PurchaseOrderStatus,
    orderDate: row.order_date,
    expectedDate: row.expected_date,
    shipToLocationId: row.ship_to_location_id,
    externalReference: row.external_reference,
    notes: row.notes,
    createdBy: row.created_by,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    cancelledBy: row.cancelled_by,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    supplierName: asSingle(row.suppliers)?.name ?? null,
    shipToLocationName: asSingle(row.locations)?.name ?? null,
  };
}

export function mapPurchaseOrderLine(row: {
  id: string;
  organization_id: string;
  purchase_order_id: string;
  line_number: number;
  item_id: string;
  variant_id: string | null;
  ordered_quantity: number | string;
  purchase_unit_id: string;
  conversion_multiplier: number | string;
  unit_cost: number | string | null;
  received_quantity: number | string;
  remaining_quantity: number | string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items?: { name: string; sku: string } | { name: string; sku: string }[] | null;
  item_variants?: { name: string } | { name: string }[] | null;
  units_of_measure?: { symbol: string } | { symbol: string }[] | null;
}): PurchaseOrderLine {
  const item = asSingle(row.items);
  return {
    id: row.id,
    organizationId: row.organization_id,
    purchaseOrderId: row.purchase_order_id,
    lineNumber: row.line_number,
    itemId: row.item_id,
    variantId: row.variant_id,
    orderedQuantity: Number(row.ordered_quantity),
    purchaseUnitId: row.purchase_unit_id,
    conversionMultiplier: Number(row.conversion_multiplier),
    unitCost: row.unit_cost === null ? null : Number(row.unit_cost),
    receivedQuantity: Number(row.received_quantity),
    remainingQuantity: Number(row.remaining_quantity),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemName: item?.name ?? null,
    itemSku: item?.sku ?? null,
    variantName: asSingle(row.item_variants)?.name ?? null,
    purchaseUnitSymbol: asSingle(row.units_of_measure)?.symbol ?? null,
  };
}

export function mapPurchaseOrderReceipt(row: {
  id: string;
  transaction_number: string;
  status: string;
  completed_at: string | null;
  notes: string | null;
  reference_text: string | null;
}): PurchaseOrderReceipt {
  return {
    id: row.id,
    transactionNumber: row.transaction_number,
    status: row.status,
    completedAt: row.completed_at,
    notes: row.notes,
    referenceText: row.reference_text,
  };
}

export function mapPurchaseOrderDbError(message: string | undefined): string {
  const text = message ?? "";
  if (text.includes("cannot receive more than remaining")) {
    return "Cannot receive more than the remaining quantity.";
  }
  if (text.includes("only draft purchase orders can be submitted")) {
    return "Only draft purchase orders can be submitted.";
  }
  if (text.includes("must have at least one line")) {
    return "Add at least one line before submitting.";
  }
  if (text.includes("cannot be cancelled")) {
    return "This purchase order cannot be cancelled.";
  }
  if (text.includes("only submitted or partially received")) {
    return "Only submitted or partially received orders can be received.";
  }
  if (text.includes("not accessible")) {
    return "A required location is not accessible.";
  }
  if (text.includes("permission denied")) {
    return "You do not have permission for this purchasing action.";
  }
  if (text.includes("supplier must be active")) {
    return "Select an active supplier.";
  }
  if (text.includes("row-level security")) {
    return "You do not have access to this purchase order.";
  }
  return text || "Purchase order operation failed.";
}
