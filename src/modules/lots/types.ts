export const LOT_STATUSES = ["active", "quarantined", "depleted", "expired"] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];

export const TRACKING_MODES = ["quantity", "lot"] as const;
export type TrackingMode = (typeof TRACKING_MODES)[number];

export type InventoryLot = {
  id: string;
  organizationId: string;
  itemId: string;
  variantId: string | null;
  lotNumber: string;
  expirationDate: string | null;
  status: LotStatus;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  itemName?: string | null;
  itemSku?: string | null;
  variantName?: string | null;
  quantityOnHand?: number | null;
};

export type ExpirationWindow = "expired" | "30" | "60" | "90";
