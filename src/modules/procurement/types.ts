export const PURCHASE_ORDER_STATUSES = [
  "draft",
  "submitted",
  "partially_received",
  "received",
  "cancelled",
] as const;

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export type PurchaseOrder = {
  id: string;
  organizationId: string;
  supplierId: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDate: string | null;
  shipToLocationId: string;
  externalReference: string | null;
  notes: string | null;
  createdBy: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  supplierName?: string | null;
  shipToLocationName?: string | null;
};

export type PurchaseOrderLine = {
  id: string;
  organizationId: string;
  purchaseOrderId: string;
  lineNumber: number;
  itemId: string;
  variantId: string | null;
  orderedQuantity: number;
  purchaseUnitId: string;
  conversionMultiplier: number;
  unitCost: number | null;
  receivedQuantity: number;
  remainingQuantity: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  itemName?: string | null;
  itemSku?: string | null;
  variantName?: string | null;
  purchaseUnitSymbol?: string | null;
};

export type PurchaseOrderReceipt = {
  id: string;
  transactionNumber: string;
  status: string;
  completedAt: string | null;
  notes: string | null;
  referenceText: string | null;
};
