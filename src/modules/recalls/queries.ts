import "server-only";

import { requirePermission } from "@/lib/auth";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { AppError } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapRecall, mapRecallLot } from "@/modules/recalls/mappers";
import type {
  AffectedStockRow,
  InventoryRecall,
  RecallLot,
  RecallStatus,
} from "@/modules/recalls/types";

export async function listRecalls(options?: {
  status?: RecallStatus | "all";
}): Promise<InventoryRecall[]> {
  const context = await requirePermission("inventory.recalls.read");
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("inventory_recalls")
    .select(
      `id, organization_id, title, recall_number, external_reference, source, severity, status,
      announced_date, notes, created_by, closed_by, closed_at, created_at, updated_at,
      inventory_recall_lots(id)`,
    )
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false });

  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;
  if (error) throw new AppError("INTERNAL", "Unable to load recalls.", 500);
  return (data ?? []).map((row) => mapRecall(row as unknown as Parameters<typeof mapRecall>[0]));
}

export async function getRecall(recallId: string): Promise<InventoryRecall> {
  const context = await requirePermission("inventory.recalls.read");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inventory_recalls")
    .select(
      `id, organization_id, title, recall_number, external_reference, source, severity, status,
      announced_date, notes, created_by, closed_by, closed_at, created_at, updated_at,
      inventory_recall_lots(id)`,
    )
    .eq("organization_id", context.organizationId)
    .eq("id", recallId)
    .maybeSingle();

  if (error) throw new AppError("INTERNAL", "Unable to load recall.", 500);
  if (!data) throw new AppError("NOT_FOUND", "Recall not found.", 404);
  return mapRecall(data as unknown as Parameters<typeof mapRecall>[0]);
}

export async function listRecallLots(recallId: string): Promise<RecallLot[]> {
  const context = await requirePermission("inventory.recalls.read");
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("inventory_recall_lots")
    .select(
      `id, organization_id, recall_id, lot_id, created_at,
      inventory_lots(
        lot_number, status, expiration_date, item_id,
        items(name, sku), item_variants(name)
      )`,
    )
    .eq("organization_id", context.organizationId)
    .eq("recall_id", recallId)
    .order("created_at", { ascending: true });

  if (error) throw new AppError("INTERNAL", "Unable to load recall lots.", 500);

  const lots = (data ?? []).map((row) =>
    mapRecallLot(row as unknown as Parameters<typeof mapRecallLot>[0]),
  );

  const lotIds = lots.map((lot) => lot.lotId);
  if (lotIds.length === 0) return lots;

  const { data: balances } = await supabase
    .from("inventory_balances")
    .select("lot_id, quantity_on_hand")
    .eq("organization_id", context.organizationId)
    .in("lot_id", lotIds);

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
    quantityOnHand: qtyByLot.get(lot.lotId) ?? 0,
  }));
}

export async function listAffectedStock(recallId: string): Promise<AffectedStockRow[]> {
  const context = await requirePermission("inventory.recalls.read");
  const { tenant } = await resolvePlatformContext();
  const supabase = await createServerSupabaseClient();

  const { data: recallLots, error: lotError } = await supabase
    .from("inventory_recall_lots")
    .select("lot_id")
    .eq("organization_id", context.organizationId)
    .eq("recall_id", recallId);

  if (lotError) throw new AppError("INTERNAL", "Unable to load affected stock.", 500);
  const lotIds = (recallLots ?? []).map((row) => row.lot_id);
  if (lotIds.length === 0) return [];

  const { data, error } = await supabase
    .from("inventory_balances")
    .select(
      `lot_id, location_id, storage_area_id, bin_id, quantity_on_hand,
      inventory_lots(lot_number),
      locations(name), storage_areas(name), storage_bins(name),
      items(units_of_measure!items_base_unit_id_fkey(symbol))`,
    )
    .eq("organization_id", context.organizationId)
    .in("lot_id", lotIds)
    .gt("quantity_on_hand", 0);

  if (error) throw new AppError("INTERNAL", "Unable to load affected stock.", 500);

  const allowed = new Set(tenant.allowedLocationIds);

  return (data ?? [])
    .filter((row) => allowed.has(row.location_id))
    .map((row) => {
      const lot = Array.isArray(row.inventory_lots)
        ? row.inventory_lots[0]
        : row.inventory_lots;
      const location = Array.isArray(row.locations) ? row.locations[0] : row.locations;
      const area = Array.isArray(row.storage_areas) ? row.storage_areas[0] : row.storage_areas;
      const bin = Array.isArray(row.storage_bins) ? row.storage_bins[0] : row.storage_bins;
      const item = Array.isArray(row.items) ? row.items[0] : row.items;
      const unit = Array.isArray(item?.units_of_measure)
        ? item?.units_of_measure[0]
        : item?.units_of_measure;
      return {
        lotId: row.lot_id as string,
        lotNumber: lot?.lot_number ?? "—",
        locationId: row.location_id,
        locationName: location?.name ?? null,
        storageAreaId: row.storage_area_id,
        storageAreaName: area?.name ?? null,
        binId: row.bin_id,
        binName: bin?.name ?? null,
        quantityOnHand: Number(row.quantity_on_hand),
        baseUnitSymbol: unit?.symbol ?? null,
      };
    });
}

export async function listRecallAuditEvents(recallId: string) {
  const context = await requirePermission("inventory.recalls.read");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("audit_events")
    .select("id, action, entity_type, entity_id, summary, actor_user_id, created_at, metadata")
    .eq("organization_id", context.organizationId)
    .eq("entity_type", "inventory_recall")
    .eq("entity_id", recallId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new AppError("INTERNAL", "Unable to load recall audit history.", 500);
  return data ?? [];
}
