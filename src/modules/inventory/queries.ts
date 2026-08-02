import "server-only";

import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapBalance, mapTransaction, mapTransactionLine } from "@/modules/inventory/mappers";
import type {
  InventoryBalance,
  InventoryTransaction,
  InventoryTransactionLine,
  InventoryTransactionStatus,
  InventoryTransactionType,
} from "@/modules/inventory/types";

export async function listBalances(filters?: {
  locationId?: string;
  storageAreaId?: string;
  binId?: string;
  itemId?: string;
  variantId?: string;
  search?: string;
}): Promise<InventoryBalance[]> {
  const context = await requirePermission("inventory.read");
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("inventory_balances")
    .select(
      "id, organization_id, item_id, variant_id, location_id, storage_area_id, bin_id, quantity_on_hand, updated_at, items(name, sku, units_of_measure!items_base_unit_id_fkey(symbol)), item_variants(name), locations(name), storage_areas(name), storage_bins(name)",
    )
    .eq("organization_id", context.organizationId)
    .order("updated_at", { ascending: false });

  if (filters?.locationId) query = query.eq("location_id", filters.locationId);
  if (filters?.storageAreaId) query = query.eq("storage_area_id", filters.storageAreaId);
  if (filters?.binId) query = query.eq("bin_id", filters.binId);
  if (filters?.itemId) query = query.eq("item_id", filters.itemId);
  if (filters?.variantId) query = query.eq("variant_id", filters.variantId);

  const { data, error } = await query;
  if (error) {
    throw new AppError("INTERNAL", "Unable to load balances.", 500);
  }

  let balances = (data ?? []).map((row) =>
    mapBalance(row as unknown as Parameters<typeof mapBalance>[0]),
  );

  if (filters?.search?.trim()) {
    const term = filters.search.trim().toLowerCase();
    balances = balances.filter(
      (b) =>
        b.itemName?.toLowerCase().includes(term) ||
        b.itemSku?.toLowerCase().includes(term) ||
        b.variantName?.toLowerCase().includes(term) ||
        b.locationName?.toLowerCase().includes(term) ||
        b.storageAreaName?.toLowerCase().includes(term) ||
        b.binName?.toLowerCase().includes(term),
    );
  }

  return balances;
}

export async function listTransactions(options?: {
  status?: InventoryTransactionStatus | "all";
  type?: InventoryTransactionType | "all";
}): Promise<InventoryTransaction[]> {
  const context = await requirePermission("inventory.read");
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("inventory_transactions")
    .select(
      "id, organization_id, transaction_number, transaction_type, status, notes, reference_text, created_by, completed_by, completed_at, reverses_transaction_id, reversed_by_transaction_id, created_at, updated_at",
    )
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false });

  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }
  if (options?.type && options.type !== "all") {
    query = query.eq("transaction_type", options.type);
  }

  const { data, error } = await query;
  if (error) {
    throw new AppError("INTERNAL", "Unable to load transactions.", 500);
  }

  return (data ?? []).map((row) => mapTransaction(row));
}

export async function getTransaction(transactionId: string): Promise<InventoryTransaction> {
  const context = await requirePermission("inventory.read");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inventory_transactions")
    .select(
      "id, organization_id, transaction_number, transaction_type, status, notes, reference_text, created_by, completed_by, completed_at, reverses_transaction_id, reversed_by_transaction_id, created_at, updated_at",
    )
    .eq("organization_id", context.organizationId)
    .eq("id", transactionId)
    .maybeSingle();

  if (error) {
    throw new AppError("INTERNAL", "Unable to load transaction.", 500);
  }
  if (!data) {
    throw new AppError("NOT_FOUND", "Transaction not found.", 404);
  }

  return mapTransaction(data);
}

export async function getLinkedTransactionNumber(
  transactionId: string | null | undefined,
): Promise<string | null> {
  if (!transactionId) return null;
  const context = await requirePermission("inventory.read");
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("inventory_transactions")
    .select("transaction_number")
    .eq("organization_id", context.organizationId)
    .eq("id", transactionId)
    .maybeSingle();
  return data?.transaction_number ?? null;
}

export async function listTransactionLines(
  transactionId: string,
): Promise<InventoryTransactionLine[]> {
  await requirePermission("inventory.read");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inventory_transaction_lines")
    .select(
      `id, organization_id, transaction_id, line_number, item_id, variant_id, entered_quantity, entered_unit_id, conversion_multiplier, base_quantity,
      destination_location_id, destination_storage_area_id, destination_bin_id,
      source_location_id, source_storage_area_id, source_bin_id,
      unit_cost, notes, created_at, updated_at,
      items(name, sku), item_variants(name),
      units_of_measure!inventory_transaction_lines_entered_unit_id_fkey(symbol),
      destination_location:locations!inventory_transaction_lines_destination_location_id_fkey(name),
      destination_area:storage_areas!inventory_transaction_lines_destination_storage_area_id_fkey(name),
      destination_bin:storage_bins!inventory_transaction_lines_destination_bin_id_fkey(name),
      source_location:locations!inventory_transaction_lines_source_location_id_fkey(name),
      source_area:storage_areas!inventory_transaction_lines_source_storage_area_id_fkey(name),
      source_bin:storage_bins!inventory_transaction_lines_source_bin_id_fkey(name)`,
    )
    .eq("transaction_id", transactionId)
    .order("line_number", { ascending: true });

  if (error) {
    throw new AppError("INTERNAL", "Unable to load transaction lines.", 500);
  }

  return (data ?? []).map((row) =>
    mapTransactionLine(row as unknown as Parameters<typeof mapTransactionLine>[0]),
  );
}
