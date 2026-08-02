import type {
  InventoryBalance,
  InventoryTransaction,
  InventoryTransactionLine,
  InventoryTransactionStatus,
  InventoryTransactionType,
} from "@/modules/inventory/types";

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function mapTransaction(row: {
  id: string;
  organization_id: string;
  transaction_number: string;
  transaction_type: string;
  status: string;
  notes: string | null;
  reference_text?: string | null;
  created_by: string | null;
  completed_by: string | null;
  completed_at: string | null;
  reverses_transaction_id?: string | null;
  reversed_by_transaction_id?: string | null;
  created_at: string;
  updated_at: string;
}): InventoryTransaction {
  return {
    id: row.id,
    organizationId: row.organization_id,
    transactionNumber: row.transaction_number,
    transactionType: row.transaction_type as InventoryTransactionType,
    status: row.status as InventoryTransactionStatus,
    notes: row.notes,
    referenceText: row.reference_text ?? null,
    createdBy: row.created_by,
    completedBy: row.completed_by,
    completedAt: row.completed_at,
    reversesTransactionId: row.reverses_transaction_id ?? null,
    reversedByTransactionId: row.reversed_by_transaction_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapTransactionLine(row: {
  id: string;
  organization_id: string;
  transaction_id: string;
  line_number: number;
  item_id: string;
  variant_id: string | null;
  entered_quantity: number | string;
  entered_unit_id: string;
  conversion_multiplier: number | string;
  base_quantity: number | string;
  destination_location_id: string | null;
  destination_storage_area_id: string | null;
  destination_bin_id: string | null;
  source_location_id?: string | null;
  source_storage_area_id?: string | null;
  source_bin_id?: string | null;
  unit_cost: number | string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items?: { name: string; sku: string } | { name: string; sku: string }[] | null;
  item_variants?: { name: string } | { name: string }[] | null;
  units_of_measure?: { symbol: string } | { symbol: string }[] | null;
  locations?: { name: string } | { name: string }[] | null;
  storage_areas?: { name: string } | { name: string }[] | null;
  storage_bins?: { name: string } | { name: string }[] | null;
  source_location?: { name: string } | { name: string }[] | null;
  source_area?: { name: string } | { name: string }[] | null;
  source_bin?: { name: string } | { name: string }[] | null;
  destination_location?: { name: string } | { name: string }[] | null;
  destination_area?: { name: string } | { name: string }[] | null;
  destination_bin?: { name: string } | { name: string }[] | null;
}): InventoryTransactionLine {
  const item = asSingle(row.items);
  return {
    id: row.id,
    organizationId: row.organization_id,
    transactionId: row.transaction_id,
    lineNumber: row.line_number,
    itemId: row.item_id,
    variantId: row.variant_id,
    enteredQuantity: Number(row.entered_quantity),
    enteredUnitId: row.entered_unit_id,
    conversionMultiplier: Number(row.conversion_multiplier),
    baseQuantity: Number(row.base_quantity),
    destinationLocationId: row.destination_location_id,
    destinationStorageAreaId: row.destination_storage_area_id,
    destinationBinId: row.destination_bin_id,
    sourceLocationId: row.source_location_id ?? null,
    sourceStorageAreaId: row.source_storage_area_id ?? null,
    sourceBinId: row.source_bin_id ?? null,
    unitCost: row.unit_cost === null ? null : Number(row.unit_cost),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemName: item?.name ?? null,
    itemSku: item?.sku ?? null,
    variantName: asSingle(row.item_variants)?.name ?? null,
    enteredUnitSymbol: asSingle(row.units_of_measure)?.symbol ?? null,
    destinationLocationName:
      asSingle(row.destination_location)?.name ?? asSingle(row.locations)?.name ?? null,
    destinationStorageAreaName:
      asSingle(row.destination_area)?.name ?? asSingle(row.storage_areas)?.name ?? null,
    destinationBinName:
      asSingle(row.destination_bin)?.name ?? asSingle(row.storage_bins)?.name ?? null,
    sourceLocationName: asSingle(row.source_location)?.name ?? null,
    sourceStorageAreaName: asSingle(row.source_area)?.name ?? null,
    sourceBinName: asSingle(row.source_bin)?.name ?? null,
  };
}

export function mapBalance(row: {
  id: string;
  organization_id: string;
  item_id: string;
  variant_id: string | null;
  location_id: string;
  storage_area_id: string;
  bin_id: string | null;
  quantity_on_hand: number | string;
  updated_at: string;
  items?:
    | { name: string; sku: string; units_of_measure?: { symbol: string } | { symbol: string }[] | null }
    | {
        name: string;
        sku: string;
        units_of_measure?: { symbol: string } | { symbol: string }[] | null;
      }[]
    | null;
  item_variants?: { name: string } | { name: string }[] | null;
  locations?: { name: string } | { name: string }[] | null;
  storage_areas?: { name: string } | { name: string }[] | null;
  storage_bins?: { name: string } | { name: string }[] | null;
}): InventoryBalance {
  const item = asSingle(row.items);
  return {
    id: row.id,
    organizationId: row.organization_id,
    itemId: row.item_id,
    variantId: row.variant_id,
    locationId: row.location_id,
    storageAreaId: row.storage_area_id,
    binId: row.bin_id,
    quantityOnHand: Number(row.quantity_on_hand),
    updatedAt: row.updated_at,
    itemName: item?.name ?? null,
    itemSku: item?.sku ?? null,
    variantName: asSingle(row.item_variants)?.name ?? null,
    locationName: asSingle(row.locations)?.name ?? null,
    storageAreaName: asSingle(row.storage_areas)?.name ?? null,
    binName: asSingle(row.storage_bins)?.name ?? null,
    baseUnitSymbol: asSingle(item?.units_of_measure)?.symbol ?? null,
  };
}

export function mapInventoryDbError(message: string | undefined): string {
  const text = message ?? "";
  if (text.includes("already completed")) {
    return "This transaction was already completed.";
  }
  if (text.includes("already reversed")) {
    return "This transaction has already been reversed.";
  }
  if (text.includes("reversal requires a reason")) {
    return "A reversal reason is required.";
  }
  if (text.includes("only completed inventory transactions can be reversed")) {
    return "Only completed transactions can be reversed.";
  }
  if (text.includes("reversal transactions cannot be reversed")) {
    return "Reversal transactions cannot be reversed.";
  }
  if (text.includes("requires a variant")) {
    return "This item requires a variant.";
  }
  if (text.includes("no conversion")) {
    return "No conversion exists from the entered unit to the item base unit.";
  }
  if (text.includes("insufficient stock")) {
    return "Insufficient stock at the selected source storage.";
  }
  if (text.includes("negative adjustment requires a reason")) {
    return "Negative adjustments require a reason.";
  }
  if (text.includes("source and destination must differ")) {
    return "Transfer source and destination must differ.";
  }
  if (text.includes("not accessible") || text.includes("location is not accessible")) {
    return "A required location is not accessible.";
  }
  if (text.includes("row-level security")) {
    return "A required location is not accessible.";
  }
  if (text.includes("cannot be edited") || text.includes("cannot be deleted") || text.includes("immutable")) {
    return "Completed inventory records cannot be changed.";
  }
  if (text.includes("without lines")) {
    return "Add at least one line before completing.";
  }
  if (text.includes("permission denied")) {
    return "You do not have permission for this inventory action.";
  }
  if (text.includes("must belong") || text.includes("are required") || text.includes("not allowed")) {
    return text;
  }
  return text || "Inventory operation failed.";
}
