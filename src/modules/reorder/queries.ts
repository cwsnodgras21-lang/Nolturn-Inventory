import "server-only";

import { requirePermission } from "@/lib/auth";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { AppError } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  effectiveReorderRule,
  stockStateFor,
  suggestedReorderQuantity,
  suggestionKey,
  sumAvailableAtLocation,
  type BalanceRowForRestock,
  type RuleScope,
} from "@/modules/reorder/calc";
import { mapReorderRule } from "@/modules/reorder/mappers";
import type { ReorderRule, RestockSuggestion, StockState } from "@/modules/reorder/types";

const RULE_SELECT = `
  id, organization_id, item_id, variant_id, location_id,
  minimum_quantity, target_quantity, reorder_quantity, preferred_supplier_id,
  status, notes, created_by, created_at, updated_at,
  items(name, sku, default_entry_unit_id, units_of_measure!items_base_unit_id_fkey(symbol)),
  item_variants(name), locations(name), suppliers!reorder_rules_preferred_supplier_id_fkey(name)
`;

export async function listReorderRules(options?: {
  itemId?: string;
  status?: "active" | "inactive" | "all";
}): Promise<ReorderRule[]> {
  const context = await requirePermission("inventory.reorder.read");
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("reorder_rules")
    .select(RULE_SELECT)
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false });

  if (options?.itemId) query = query.eq("item_id", options.itemId);
  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;
  if (error) throw new AppError("INTERNAL", "Unable to load reorder rules.", 500);
  return (data ?? []).map((row) =>
    mapReorderRule(row as unknown as Parameters<typeof mapReorderRule>[0]),
  );
}

export async function listRestockSuggestions(options?: {
  stockState?: "low" | "out" | "all";
}): Promise<RestockSuggestion[]> {
  const context = await requirePermission("inventory.reorder.read");
  const { tenant } = await resolvePlatformContext();
  const supabase = await createServerSupabaseClient();
  const allowedLocations = new Set(tenant.allowedLocationIds);
  const today = new Date().toISOString().slice(0, 10);

  const { data: rulesData, error: rulesError } = await supabase
    .from("reorder_rules")
    .select(RULE_SELECT)
    .eq("organization_id", context.organizationId)
    .eq("status", "active");

  if (rulesError) throw new AppError("INTERNAL", "Unable to load reorder rules.", 500);

  const rules = (rulesData ?? []).map((row) =>
    mapReorderRule(row as unknown as Parameters<typeof mapReorderRule>[0]),
  );
  if (rules.length === 0) return [];

  const ruleScopes: RuleScope[] = rules.map((rule) => ({
    id: rule.id,
    itemId: rule.itemId,
    variantId: rule.variantId,
    locationId: rule.locationId,
    minimumQuantity: rule.minimumQuantity,
    targetQuantity: rule.targetQuantity,
    reorderQuantity: rule.reorderQuantity,
    preferredSupplierId: rule.preferredSupplierId,
    status: rule.status,
  }));

  const itemIds = [...new Set(rules.map((rule) => rule.itemId))];

  const { data: balances, error: balErr } = await supabase
    .from("inventory_balances")
    .select(
      `item_id, variant_id, location_id, quantity_on_hand, lot_id,
      inventory_lots(status, expiration_date),
      items(name, sku, default_entry_unit_id, units_of_measure!items_base_unit_id_fkey(symbol)),
      item_variants(name), locations(name)`,
    )
    .eq("organization_id", context.organizationId)
    .in("item_id", itemIds);

  if (balErr) throw new AppError("INTERNAL", "Unable to load balances for restock.", 500);

  type BalanceEmbed = {
    item_id: string;
    variant_id: string | null;
    location_id: string;
    quantity_on_hand: number | string;
    lot_id: string | null;
    inventory_lots:
      | { status: string; expiration_date: string | null }
      | { status: string; expiration_date: string | null }[]
      | null;
    items:
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
    item_variants: { name: string } | { name: string }[] | null;
    locations: { name: string } | { name: string }[] | null;
  };

  const balanceRows = (balances ?? []) as unknown as BalanceEmbed[];

  const usableBalances: BalanceRowForRestock[] = balanceRows.map((row) => {
    const lot = Array.isArray(row.inventory_lots)
      ? row.inventory_lots[0]
      : row.inventory_lots;
    return {
      itemId: row.item_id,
      variantId: row.variant_id,
      locationId: row.location_id,
      quantityOnHand: Number(row.quantity_on_hand),
      lot: lot
        ? { status: lot.status, expirationDate: lot.expiration_date }
        : row.lot_id
          ? { status: "unknown", expirationDate: null }
          : null,
    };
  });

  const metaByItemVariant = new Map<
    string,
    {
      itemName: string | null;
      itemSku: string | null;
      variantName: string | null;
      baseUnitSymbol: string | null;
      defaultEntryUnitId: string | null;
    }
  >();

  for (const row of balanceRows) {
    const key = `${row.item_id}|${row.variant_id ?? ""}`;
    if (metaByItemVariant.has(key)) continue;
    const item = Array.isArray(row.items) ? row.items[0] : row.items;
    const variant = Array.isArray(row.item_variants)
      ? row.item_variants[0]
      : row.item_variants;
    const unit = Array.isArray(item?.units_of_measure)
      ? item?.units_of_measure[0]
      : item?.units_of_measure;
    metaByItemVariant.set(key, {
      itemName: item?.name ?? null,
      itemSku: item?.sku ?? null,
      variantName: variant?.name ?? null,
      baseUnitSymbol: unit?.symbol ?? null,
      defaultEntryUnitId: item?.default_entry_unit_id ?? null,
    });
  }

  for (const rule of rules) {
    const key = `${rule.itemId}|${rule.variantId ?? ""}`;
    if (!metaByItemVariant.has(key)) {
      metaByItemVariant.set(key, {
        itemName: rule.itemName ?? null,
        itemSku: rule.itemSku ?? null,
        variantName: rule.variantName ?? null,
        baseUnitSymbol: rule.baseUnitSymbol ?? null,
        defaultEntryUnitId: rule.defaultEntryUnitId ?? null,
      });
    }
  }

  const locationNames = new Map<string, string | null>();
  for (const row of balanceRows) {
    const loc = Array.isArray(row.locations) ? row.locations[0] : row.locations;
    locationNames.set(row.location_id, loc?.name ?? null);
  }
  for (const rule of rules) {
    if (rule.locationId) locationNames.set(rule.locationId, rule.locationName ?? null);
  }

  // Candidate locations: balances for item/variant + location overrides
  const candidateKeys = new Set<string>();
  for (const row of usableBalances) {
    if (!allowedLocations.has(row.locationId)) continue;
    candidateKeys.add(`${row.itemId}|${row.variantId ?? ""}|${row.locationId}`);
  }
  for (const rule of rules) {
    if (rule.locationId && allowedLocations.has(rule.locationId)) {
      candidateKeys.add(`${rule.itemId}|${rule.variantId ?? ""}|${rule.locationId}`);
    }
  }

  const supplierNames = new Map<string, string>();
  for (const rule of rules) {
    if (rule.preferredSupplierId && rule.preferredSupplierName) {
      supplierNames.set(rule.preferredSupplierId, rule.preferredSupplierName);
    }
  }

  const suggestions: RestockSuggestion[] = [];

  for (const key of candidateKeys) {
    const parts = key.split("|");
    const itemId = parts[0] ?? "";
    const variantPart = parts[1] ?? "";
    const locationId = parts[2] ?? "";
    if (!itemId || !locationId) continue;
    const variantId = variantPart ? variantPart : null;
    const rule = effectiveReorderRule(ruleScopes, itemId, variantId, locationId);
    if (!rule) continue;

    const available = sumAvailableAtLocation(
      usableBalances,
      itemId,
      variantId,
      locationId,
      today,
    );
    const state = stockStateFor(available, rule.minimumQuantity);
    if (state === "ok") continue;

    const suggested = suggestedReorderQuantity({
      available,
      minimum: rule.minimumQuantity,
      target: rule.targetQuantity,
      reorderQuantity: rule.reorderQuantity,
    });
    if (suggested <= 0) continue;

    const meta = metaByItemVariant.get(`${itemId}|${variantId ?? ""}`);
    suggestions.push({
      key: suggestionKey(itemId, variantId, locationId),
      itemId,
      variantId,
      locationId,
      ruleId: rule.id,
      ruleIsLocationOverride: rule.locationId === locationId,
      minimumQuantity: rule.minimumQuantity,
      targetQuantity: rule.targetQuantity,
      reorderQuantity: rule.reorderQuantity,
      preferredSupplierId: rule.preferredSupplierId,
      preferredSupplierName: rule.preferredSupplierId
        ? (supplierNames.get(rule.preferredSupplierId) ?? null)
        : null,
      availableQuantity: available,
      suggestedQuantity: suggested,
      stockState: state as Exclude<StockState, "ok">,
      itemName: meta?.itemName ?? null,
      itemSku: meta?.itemSku ?? null,
      variantName: meta?.variantName ?? null,
      locationName: locationNames.get(locationId) ?? null,
      baseUnitSymbol: meta?.baseUnitSymbol ?? null,
      defaultEntryUnitId: meta?.defaultEntryUnitId ?? null,
    });
  }

  // Enrich supplier names for rules that came via effective default
  const missingSupplierIds = [
    ...new Set(
      suggestions
        .filter((s) => s.preferredSupplierId && !s.preferredSupplierName)
        .map((s) => s.preferredSupplierId as string),
    ),
  ];
  if (missingSupplierIds.length > 0) {
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("organization_id", context.organizationId)
      .in("id", missingSupplierIds);
    for (const supplier of suppliers ?? []) {
      supplierNames.set(supplier.id, supplier.name);
    }
    for (const suggestion of suggestions) {
      if (suggestion.preferredSupplierId && !suggestion.preferredSupplierName) {
        suggestion.preferredSupplierName =
          supplierNames.get(suggestion.preferredSupplierId) ?? null;
      }
    }
  }

  // Fill location names for override-only candidates
  const missingLocationIds = [
    ...new Set(
      suggestions
        .filter((s) => !s.locationName)
        .map((s) => s.locationId),
    ),
  ];
  if (missingLocationIds.length > 0) {
    const { data: locations } = await supabase
      .from("locations")
      .select("id, name")
      .eq("organization_id", context.organizationId)
      .in("id", missingLocationIds);
    for (const location of locations ?? []) {
      locationNames.set(location.id, location.name);
    }
    for (const suggestion of suggestions) {
      if (!suggestion.locationName) {
        suggestion.locationName = locationNames.get(suggestion.locationId) ?? null;
      }
    }
  }

  const filter = options?.stockState ?? "all";
  const filtered =
    filter === "all"
      ? suggestions
      : suggestions.filter((suggestion) => suggestion.stockState === filter);

  return filtered.sort((a, b) => {
    if (a.stockState !== b.stockState) return a.stockState === "out" ? -1 : 1;
    return (a.itemName ?? "").localeCompare(b.itemName ?? "");
  });
}
