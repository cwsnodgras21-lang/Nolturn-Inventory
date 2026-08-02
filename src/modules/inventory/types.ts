export const INVENTORY_TRANSACTION_TYPES = [
  "opening_balance",
  "positive_adjustment",
  "negative_adjustment",
  "receipt",
  "consumption",
  "transfer",
] as const;
export type InventoryTransactionType = (typeof INVENTORY_TRANSACTION_TYPES)[number];

export const INVENTORY_TRANSACTION_STATUSES = ["draft", "completed", "cancelled"] as const;
export type InventoryTransactionStatus = (typeof INVENTORY_TRANSACTION_STATUSES)[number];

export const INBOUND_TRANSACTION_TYPES = [
  "opening_balance",
  "positive_adjustment",
  "receipt",
] as const;

export const OUTBOUND_TRANSACTION_TYPES = ["consumption", "negative_adjustment"] as const;

export type InventoryTransaction = {
  id: string;
  organizationId: string;
  transactionNumber: string;
  transactionType: InventoryTransactionType;
  status: InventoryTransactionStatus;
  notes: string | null;
  referenceText: string | null;
  createdBy: string | null;
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InventoryTransactionLine = {
  id: string;
  organizationId: string;
  transactionId: string;
  lineNumber: number;
  itemId: string;
  variantId: string | null;
  enteredQuantity: number;
  enteredUnitId: string;
  conversionMultiplier: number;
  baseQuantity: number;
  destinationLocationId: string | null;
  destinationStorageAreaId: string | null;
  destinationBinId: string | null;
  sourceLocationId: string | null;
  sourceStorageAreaId: string | null;
  sourceBinId: string | null;
  unitCost: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  itemName?: string | null;
  itemSku?: string | null;
  variantName?: string | null;
  enteredUnitSymbol?: string | null;
  destinationLocationName?: string | null;
  destinationStorageAreaName?: string | null;
  destinationBinName?: string | null;
  sourceLocationName?: string | null;
  sourceStorageAreaName?: string | null;
  sourceBinName?: string | null;
};

export type InventoryBalance = {
  id: string;
  organizationId: string;
  itemId: string;
  variantId: string | null;
  locationId: string;
  storageAreaId: string;
  binId: string | null;
  quantityOnHand: number;
  updatedAt: string;
  itemName?: string | null;
  itemSku?: string | null;
  variantName?: string | null;
  locationName?: string | null;
  storageAreaName?: string | null;
  binName?: string | null;
  baseUnitSymbol?: string | null;
};

export type InventoryLedgerEntry = {
  id: string;
  organizationId: string;
  transactionId: string;
  transactionLineId: string;
  itemId: string;
  variantId: string | null;
  locationId: string;
  storageAreaId: string;
  binId: string | null;
  quantityDelta: number;
  effectRole?: string;
  occurredAt: string;
  createdAt: string;
};

export function permissionForTransactionType(
  type: InventoryTransactionType,
): "inventory.adjust" | "inventory.receive" | "inventory.consume" | "inventory.transfer" {
  switch (type) {
    case "receipt":
      return "inventory.receive";
    case "consumption":
      return "inventory.consume";
    case "transfer":
      return "inventory.transfer";
    default:
      return "inventory.adjust";
  }
}
