import type { ReorderRule, ReorderStatus } from "@/modules/reorder/types";

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function mapReorderRule(row: {
  id: string;
  organization_id: string;
  item_id: string;
  variant_id: string | null;
  location_id: string | null;
  minimum_quantity: number | string;
  target_quantity: number | string;
  reorder_quantity: number | string | null;
  preferred_supplier_id: string | null;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items?:
    | {
        name: string;
        sku: string;
        default_entry_unit_id: string | null;
        units_of_measure?: { symbol: string } | { symbol: string }[] | null;
      }
    | {
        name: string;
        sku: string;
        default_entry_unit_id: string | null;
        units_of_measure?: { symbol: string } | { symbol: string }[] | null;
      }[]
    | null;
  item_variants?: { name: string } | { name: string }[] | null;
  locations?: { name: string } | { name: string }[] | null;
  suppliers?: { name: string } | { name: string }[] | null;
}): ReorderRule {
  const item = asSingle(row.items);
  return {
    id: row.id,
    organizationId: row.organization_id,
    itemId: row.item_id,
    variantId: row.variant_id,
    locationId: row.location_id,
    minimumQuantity: Number(row.minimum_quantity),
    targetQuantity: Number(row.target_quantity),
    reorderQuantity:
      row.reorder_quantity == null ? null : Number(row.reorder_quantity),
    preferredSupplierId: row.preferred_supplier_id,
    status: row.status as ReorderStatus,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemName: item?.name ?? null,
    itemSku: item?.sku ?? null,
    variantName: asSingle(row.item_variants)?.name ?? null,
    locationName: asSingle(row.locations)?.name ?? null,
    preferredSupplierName: asSingle(row.suppliers)?.name ?? null,
    baseUnitSymbol: asSingle(item?.units_of_measure)?.symbol ?? null,
    defaultEntryUnitId: item?.default_entry_unit_id ?? null,
  };
}

export function mapReorderDbError(message: string | undefined): string {
  const text = message ?? "";
  if (text.includes("reorder_rules_scope_uidx") || text.includes("duplicate key")) {
    return "A reorder rule already exists for this item, variant, and location.";
  }
  if (text.includes("reorder_rules_target_gte_minimum")) {
    return "Target quantity must be greater than or equal to minimum quantity.";
  }
  if (text.includes("reorder rule item must belong")) {
    return "Reorder rule item must belong to the same organization.";
  }
  if (text.includes("reorder rule variant must belong")) {
    return "Reorder rule variant must belong to the selected item.";
  }
  if (text.includes("preferred supplier must belong")) {
    return "Preferred supplier must belong to the same organization.";
  }
  if (text.includes("restock_plan_requests_org_key_uidx")) {
    return "This restock request was already processed.";
  }
  if (text.includes("permission denied") || text.includes("row-level security")) {
    return "You do not have permission for this reorder action.";
  }
  return text || "Reorder operation failed.";
}
