export const RECALL_STATUSES = ["draft", "active", "resolved", "cancelled"] as const;
export type RecallStatus = (typeof RECALL_STATUSES)[number];

export const RECALL_SEVERITIES = [
  "informational",
  "low",
  "medium",
  "high",
  "critical",
] as const;
export type RecallSeverity = (typeof RECALL_SEVERITIES)[number];

export type InventoryRecall = {
  id: string;
  organizationId: string;
  title: string;
  recallNumber: string;
  externalReference: string | null;
  source: string;
  severity: RecallSeverity;
  status: RecallStatus;
  announcedDate: string | null;
  notes: string | null;
  createdBy: string | null;
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lotCount?: number;
};

export type RecallLot = {
  id: string;
  organizationId: string;
  recallId: string;
  lotId: string;
  createdAt: string;
  lotNumber?: string | null;
  lotStatus?: string | null;
  expirationDate?: string | null;
  itemId?: string | null;
  itemName?: string | null;
  itemSku?: string | null;
  variantName?: string | null;
  quantityOnHand?: number;
};

export type AffectedStockRow = {
  lotId: string;
  lotNumber: string;
  locationId: string;
  locationName: string | null;
  storageAreaId: string;
  storageAreaName: string | null;
  binId: string | null;
  binName: string | null;
  quantityOnHand: number;
  baseUnitSymbol: string | null;
};
