import type {
  CountLine,
  CountLineStatus,
  CountSession,
  CountSessionStatus,
} from "@/modules/counts/types";

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function mapCountSession(row: {
  id: string;
  organization_id: string;
  name: string;
  status: string;
  blind_count_enabled: boolean;
  notes: string | null;
  created_by: string | null;
  started_by: string | null;
  started_at: string | null;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  count_session_locations?:
    | Array<{ location_id: string; locations?: { name: string } | { name: string }[] | null }>
    | null;
}): CountSession {
  const locations = row.count_session_locations ?? [];
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    status: row.status as CountSessionStatus,
    blindCountEnabled: row.blind_count_enabled,
    notes: row.notes,
    createdBy: row.created_by,
    startedBy: row.started_by,
    startedAt: row.started_at,
    completedBy: row.completed_by,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    locationIds: locations.map((l) => l.location_id),
    locationNames: locations.map((l) => asSingle(l.locations)?.name ?? "Location"),
  };
}

export function mapCountLine(row: {
  id: string;
  organization_id: string;
  count_session_id: string;
  item_id: string;
  variant_id: string | null;
  lot_id?: string | null;
  location_id: string;
  storage_area_id: string;
  bin_id: string | null;
  expected_quantity: number | string;
  counted_quantity: number | string | null;
  variance: number | string | null;
  status: string;
  notes: string | null;
  counted_by: string | null;
  counted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reconciliation_transaction_id: string | null;
  created_at: string;
  updated_at: string;
  items?:
    | {
        name: string;
        sku: string;
        units_of_measure?: { symbol: string } | { symbol: string }[] | null;
      }
    | {
        name: string;
        sku: string;
        units_of_measure?: { symbol: string } | { symbol: string }[] | null;
      }[]
    | null;
  item_variants?: { name: string } | { name: string }[] | null;
  inventory_lots?: { lot_number: string } | { lot_number: string }[] | null;
  locations?: { name: string } | { name: string }[] | null;
  storage_areas?: { name: string } | { name: string }[] | null;
  storage_bins?: { name: string } | { name: string }[] | null;
}): CountLine {
  const item = asSingle(row.items);
  return {
    id: row.id,
    organizationId: row.organization_id,
    countSessionId: row.count_session_id,
    itemId: row.item_id,
    variantId: row.variant_id,
    lotId: row.lot_id ?? null,
    locationId: row.location_id,
    storageAreaId: row.storage_area_id,
    binId: row.bin_id,
    expectedQuantity: Number(row.expected_quantity),
    countedQuantity: row.counted_quantity === null ? null : Number(row.counted_quantity),
    variance: row.variance === null ? null : Number(row.variance),
    status: row.status as CountLineStatus,
    notes: row.notes,
    countedBy: row.counted_by,
    countedAt: row.counted_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reconciliationTransactionId: row.reconciliation_transaction_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemName: item?.name ?? null,
    itemSku: item?.sku ?? null,
    variantName: asSingle(row.item_variants)?.name ?? null,
    lotNumber: asSingle(row.inventory_lots)?.lot_number ?? null,
    locationName: asSingle(row.locations)?.name ?? null,
    storageAreaName: asSingle(row.storage_areas)?.name ?? null,
    binName: asSingle(row.storage_bins)?.name ?? null,
    baseUnitSymbol: asSingle(item?.units_of_measure)?.symbol ?? null,
  };
}

export function mapCountDbError(message: string | undefined): string {
  const text = message ?? "";
  if (text.includes("assign at least one location")) {
    return "Assign at least one location before starting the count.";
  }
  if (text.includes("only draft count sessions can be started")) {
    return "Only draft counts can be started.";
  }
  if (text.includes("all count lines must be counted")) {
    return "Enter a counted quantity for every line before review.";
  }
  if (text.includes("all count lines must be accepted or rejected")) {
    return "Accept or reject every line before approving reconciliation.";
  }
  if (text.includes("already completed")) {
    return "This count was already completed.";
  }
  if (text.includes("expected quantity is frozen")) {
    return "Expected quantity is frozen and cannot be changed.";
  }
  if (text.includes("not accessible")) {
    return "A required location is not accessible.";
  }
  if (text.includes("insufficient stock")) {
    return "Insufficient stock to post a negative count variance.";
  }
  if (text.includes("permission denied")) {
    return "You do not have permission for this count action.";
  }
  if (text.includes("row-level security")) {
    return "A required location is not accessible.";
  }
  return text || "Count operation failed.";
}
