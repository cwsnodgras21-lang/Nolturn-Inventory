export const REORDER_STATUSES = ["active", "inactive"] as const;
export type ReorderStatus = (typeof REORDER_STATUSES)[number];

export const STOCK_STATES = ["ok", "low", "out"] as const;
export type StockState = (typeof STOCK_STATES)[number];

export type ReorderRule = {
  id: string;
  organizationId: string;
  itemId: string;
  variantId: string | null;
  locationId: string | null;
  minimumQuantity: number;
  targetQuantity: number;
  reorderQuantity: number | null;
  preferredSupplierId: string | null;
  status: ReorderStatus;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  itemName?: string | null;
  itemSku?: string | null;
  variantName?: string | null;
  locationName?: string | null;
  preferredSupplierName?: string | null;
  baseUnitSymbol?: string | null;
  defaultEntryUnitId?: string | null;
};

export type RestockSuggestion = {
  /** Stable key for selection: item|variant|location|rule */
  key: string;
  itemId: string;
  variantId: string | null;
  locationId: string;
  ruleId: string;
  ruleIsLocationOverride: boolean;
  minimumQuantity: number;
  targetQuantity: number;
  reorderQuantity: number | null;
  preferredSupplierId: string | null;
  preferredSupplierName: string | null;
  availableQuantity: number;
  suggestedQuantity: number;
  stockState: Exclude<StockState, "ok">;
  itemName: string | null;
  itemSku: string | null;
  variantName: string | null;
  locationName: string | null;
  baseUnitSymbol: string | null;
  defaultEntryUnitId: string | null;
};
