import type { InventoryLot, LotStatus } from "@/modules/lots/types";

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function mapLot(row: {
  id: string;
  organization_id: string;
  item_id: string;
  variant_id: string | null;
  lot_number: string;
  expiration_date: string | null;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items?: { name: string; sku: string } | { name: string; sku: string }[] | null;
  item_variants?: { name: string } | { name: string }[] | null;
  quantity_on_hand?: number | string | null;
}): InventoryLot {
  const item = asSingle(row.items);
  return {
    id: row.id,
    organizationId: row.organization_id,
    itemId: row.item_id,
    variantId: row.variant_id,
    lotNumber: row.lot_number,
    expirationDate: row.expiration_date,
    status: row.status as LotStatus,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemName: item?.name ?? null,
    itemSku: item?.sku ?? null,
    variantName: asSingle(row.item_variants)?.name ?? null,
    quantityOnHand:
      row.quantity_on_hand === null || row.quantity_on_hand === undefined
        ? null
        : Number(row.quantity_on_hand),
  };
}

export function mapLotDbError(message: string | undefined): string {
  const text = message ?? "";
  if (text.includes("inventory_lots_scope_number_uidx") || text.includes("duplicate key")) {
    return "A lot with this number already exists for the item.";
  }
  if (text.includes("tracking mode cannot change")) {
    return "Tracking mode cannot change after inventory activity.";
  }
  if (text.includes("lots can only be created for lot-tracked")) {
    return "Enable lot tracking on the item before creating lots.";
  }
  if (text.includes("lot is not available")) {
    return "This lot is quarantined, depleted, or expired and cannot be used.";
  }
  if (text.includes("lot-tracked items require a lot")) {
    return "Select or create a lot for this item.";
  }
  if (text.includes("transaction history cannot be deleted")) {
    return "Lots with transaction history cannot be deleted.";
  }
  if (text.includes("row-level security")) {
    return "You do not have permission for this lot action.";
  }
  return text || "Lot operation failed.";
}
