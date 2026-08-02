import type { StockState } from "@/modules/reorder/types";

export type UsableLotRef = {
  status: string;
  expirationDate: string | null;
};

/** Usable lot: active status and not past expiration (UTC date). */
export function isUsableLot(
  lot: UsableLotRef | null | undefined,
  todayIsoDate: string,
): boolean {
  if (!lot) return true; // quantity-tracked balance (no lot)
  if (lot.status !== "active") return false;
  if (lot.expirationDate && lot.expirationDate < todayIsoDate) return false;
  return true;
}

export function stockStateFor(available: number, minimum: number): StockState {
  if (available <= 0) return "out";
  if (available < minimum) return "low";
  return "ok";
}

/**
 * Suggested replenishment when below minimum:
 * - fixed reorder_quantity when configured
 * - otherwise enough to reach target
 */
export function suggestedReorderQuantity(input: {
  available: number;
  minimum: number;
  target: number;
  reorderQuantity: number | null;
}): number {
  if (input.available >= input.minimum) return 0;
  if (input.reorderQuantity != null && input.reorderQuantity > 0) {
    return input.reorderQuantity;
  }
  return Math.max(0, input.target - input.available);
}

export function suggestionKey(
  itemId: string,
  variantId: string | null,
  locationId: string,
): string {
  return `${itemId}|${variantId ?? ""}|${locationId}`;
}

export type BalanceRowForRestock = {
  itemId: string;
  variantId: string | null;
  locationId: string;
  quantityOnHand: number;
  lot: UsableLotRef | null;
};

export function sumAvailableAtLocation(
  balances: BalanceRowForRestock[],
  itemId: string,
  variantId: string | null,
  locationId: string,
  todayIsoDate: string,
): number {
  let total = 0;
  for (const row of balances) {
    if (row.itemId !== itemId) continue;
    if ((row.variantId ?? null) !== (variantId ?? null)) continue;
    if (row.locationId !== locationId) continue;
    if (!isUsableLot(row.lot, todayIsoDate)) continue;
    total += row.quantityOnHand;
  }
  return total;
}

export type RuleScope = {
  id: string;
  itemId: string;
  variantId: string | null;
  locationId: string | null;
  minimumQuantity: number;
  targetQuantity: number;
  reorderQuantity: number | null;
  preferredSupplierId: string | null;
  status: string;
};

/** Location-specific active rule wins over default (location_id null). */
export function effectiveReorderRule(
  rules: RuleScope[],
  itemId: string,
  variantId: string | null,
  locationId: string,
): RuleScope | null {
  const matching = rules.filter(
    (rule) =>
      rule.status === "active" &&
      rule.itemId === itemId &&
      (rule.variantId ?? null) === (variantId ?? null),
  );
  const override = matching.find((rule) => rule.locationId === locationId);
  if (override) return override;
  return matching.find((rule) => rule.locationId == null) ?? null;
}
