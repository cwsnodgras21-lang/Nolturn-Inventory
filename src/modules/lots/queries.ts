import "server-only";

import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapLot } from "@/modules/lots/mappers";
import type { ExpirationWindow, InventoryLot, LotStatus } from "@/modules/lots/types";

export async function listLots(options?: {
  itemId?: string;
  status?: LotStatus | "all";
  expiration?: ExpirationWindow | "all";
}): Promise<InventoryLot[]> {
  const context = await requirePermission("inventory.lots.read");
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("inventory_lots")
    .select(
      `id, organization_id, item_id, variant_id, lot_number, expiration_date, status, notes,
      created_by, created_at, updated_at, items(name, sku), item_variants(name)`,
    )
    .eq("organization_id", context.organizationId)
    .order("expiration_date", { ascending: true, nullsFirst: false });

  if (options?.itemId) query = query.eq("item_id", options.itemId);
  if (options?.status && options.status !== "all") query = query.eq("status", options.status);

  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (options?.expiration && options.expiration !== "all") {
    if (options.expiration === "expired") {
      query = query.lt("expiration_date", iso(today));
    } else {
      const days = Number(options.expiration);
      const end = new Date(today);
      end.setUTCDate(end.getUTCDate() + days);
      query = query.gte("expiration_date", iso(today)).lte("expiration_date", iso(end));
    }
  }

  const { data, error } = await query;
  if (error) throw new AppError("INTERNAL", "Unable to load lots.", 500);

  const lots = (data ?? []).map((row) => mapLot(row as unknown as Parameters<typeof mapLot>[0]));

  const { data: balances } = await supabase
    .from("inventory_balances")
    .select("lot_id, quantity_on_hand")
    .eq("organization_id", context.organizationId)
    .not("lot_id", "is", null);

  const qtyByLot = new Map<string, number>();
  for (const balance of balances ?? []) {
    if (!balance.lot_id) continue;
    qtyByLot.set(
      balance.lot_id,
      (qtyByLot.get(balance.lot_id) ?? 0) + Number(balance.quantity_on_hand),
    );
  }

  return lots.map((lot) => ({
    ...lot,
    quantityOnHand: qtyByLot.get(lot.id) ?? 0,
  }));
}

export async function listActiveLotsForItem(
  itemId: string,
  variantId?: string | null,
): Promise<InventoryLot[]> {
  const lots = await listLots({ itemId, status: "active" });
  return lots.filter((lot) =>
    variantId === undefined ? true : lot.variantId === (variantId ?? null),
  );
}

export async function getLot(lotId: string): Promise<InventoryLot> {
  const context = await requirePermission("inventory.lots.read");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inventory_lots")
    .select(
      `id, organization_id, item_id, variant_id, lot_number, expiration_date, status, notes,
      created_by, created_at, updated_at, items(name, sku), item_variants(name)`,
    )
    .eq("organization_id", context.organizationId)
    .eq("id", lotId)
    .maybeSingle();

  if (error) throw new AppError("INTERNAL", "Unable to load lot.", 500);
  if (!data) throw new AppError("NOT_FOUND", "Lot not found.", 404);
  return mapLot(data as unknown as Parameters<typeof mapLot>[0]);
}

export type LotMovement = {
  id: string;
  lotId: string;
  transactionId: string;
  transactionNumber: string | null;
  transactionType: string | null;
  quantityDelta: number;
  locationName: string | null;
  storageAreaName: string | null;
  binName: string | null;
  occurredAt: string;
};

export async function listLotMovements(lotId: string): Promise<LotMovement[]> {
  const context = await requirePermission("inventory.lots.read");
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("inventory_ledger_entries")
    .select(
      `id, lot_id, transaction_id, quantity_delta, occurred_at,
      locations(name), storage_areas(name), storage_bins(name),
      inventory_transactions(transaction_number, transaction_type)`,
    )
    .eq("organization_id", context.organizationId)
    .eq("lot_id", lotId)
    .order("occurred_at", { ascending: false });

  if (error) throw new AppError("INTERNAL", "Unable to load lot movements.", 500);

  return (data ?? []).map((row) => {
    const txn = Array.isArray(row.inventory_transactions)
      ? row.inventory_transactions[0]
      : row.inventory_transactions;
    const location = Array.isArray(row.locations) ? row.locations[0] : row.locations;
    const area = Array.isArray(row.storage_areas) ? row.storage_areas[0] : row.storage_areas;
    const bin = Array.isArray(row.storage_bins) ? row.storage_bins[0] : row.storage_bins;
    return {
      id: row.id,
      lotId: row.lot_id as string,
      transactionId: row.transaction_id,
      transactionNumber: txn?.transaction_number ?? null,
      transactionType: txn?.transaction_type ?? null,
      quantityDelta: Number(row.quantity_delta),
      locationName: location?.name ?? null,
      storageAreaName: area?.name ?? null,
      binName: bin?.name ?? null,
      occurredAt: row.occurred_at,
    };
  });
}
