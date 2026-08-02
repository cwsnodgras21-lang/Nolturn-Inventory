import { z } from "zod";

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  shipToLocationId: z.string().uuid(),
  orderDate: z.string().min(1),
  expectedDate: z.string().optional().nullable(),
  externalReference: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const updatePurchaseOrderSchema = createPurchaseOrderSchema.partial();

export const upsertPurchaseOrderLineSchema = z.object({
  itemId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  orderedQuantity: z.number().positive(),
  purchaseUnitId: z.string().uuid(),
  unitCost: z.number().nonnegative().nullable().optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const receivePurchaseOrderSchema = z.object({
  notes: z.string().trim().max(2000).optional().nullable(),
  referenceText: z.string().trim().max(200).optional().nullable(),
  lines: z
    .array(
      z.object({
        purchaseOrderLineId: z.string().uuid(),
        quantity: z.number().positive(),
        destinationLocationId: z.string().uuid(),
        destinationStorageAreaId: z.string().uuid(),
        destinationBinId: z.string().uuid().nullable().optional(),
        unitCost: z.number().nonnegative().nullable().optional(),
      }),
    )
    .min(1),
});
