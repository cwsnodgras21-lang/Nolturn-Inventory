export const COUNT_SESSION_STATUSES = [
  "draft",
  "in_progress",
  "ready_for_review",
  "completed",
  "cancelled",
] as const;
export type CountSessionStatus = (typeof COUNT_SESSION_STATUSES)[number];

export const COUNT_LINE_STATUSES = ["pending", "counted", "accepted", "rejected"] as const;
export type CountLineStatus = (typeof COUNT_LINE_STATUSES)[number];

export type CountSession = {
  id: string;
  organizationId: string;
  name: string;
  status: CountSessionStatus;
  blindCountEnabled: boolean;
  notes: string | null;
  createdBy: string | null;
  startedBy: string | null;
  startedAt: string | null;
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  locationIds?: string[];
  locationNames?: string[];
};

export type CountLine = {
  id: string;
  organizationId: string;
  countSessionId: string;
  itemId: string;
  variantId: string | null;
  lotId: string | null;
  locationId: string;
  storageAreaId: string;
  binId: string | null;
  expectedQuantity: number;
  countedQuantity: number | null;
  variance: number | null;
  status: CountLineStatus;
  notes: string | null;
  countedBy: string | null;
  countedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reconciliationTransactionId: string | null;
  createdAt: string;
  updatedAt: string;
  itemName?: string | null;
  itemSku?: string | null;
  variantName?: string | null;
  lotNumber?: string | null;
  locationName?: string | null;
  storageAreaName?: string | null;
  binName?: string | null;
  baseUnitSymbol?: string | null;
};

export function shouldRevealExpectedQuantity(options: {
  blindCountEnabled: boolean;
  sessionStatus: CountSessionStatus;
  canReview: boolean;
}): boolean {
  if (!options.blindCountEnabled) return true;
  if (options.canReview) return true;
  return (
    options.sessionStatus === "ready_for_review" || options.sessionStatus === "completed"
  );
}
