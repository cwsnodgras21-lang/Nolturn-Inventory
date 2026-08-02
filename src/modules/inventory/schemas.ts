import { z } from "zod";
import { INVENTORY_TRANSACTION_TYPES } from "@/modules/inventory/types";

export const createInventoryTransactionSchema = z.object({
  transactionType: z.enum(INVENTORY_TRANSACTION_TYPES),
  notes: z.string().trim().max(2000).optional().nullable(),
  referenceText: z.string().trim().max(200).optional().nullable(),
});

/** @deprecated Prefer createInventoryTransactionSchema */
export const createAdjustmentSchema = createInventoryTransactionSchema.extend({
  transactionType: z
    .enum(["opening_balance", "positive_adjustment", "negative_adjustment"])
    .default("positive_adjustment"),
});

export const updateInventoryTransactionSchema = z.object({
  notes: z.string().trim().max(2000).optional().nullable(),
  referenceText: z.string().trim().max(200).optional().nullable(),
});

export const updateAdjustmentSchema = updateInventoryTransactionSchema;

export const upsertInventoryLineSchema = z.object({
  itemId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  enteredQuantity: z.number().positive(),
  enteredUnitId: z.string().uuid(),
  destinationLocationId: z.string().uuid().nullable().optional(),
  destinationStorageAreaId: z.string().uuid().nullable().optional(),
  destinationBinId: z.string().uuid().nullable().optional(),
  sourceLocationId: z.string().uuid().nullable().optional(),
  sourceStorageAreaId: z.string().uuid().nullable().optional(),
  sourceBinId: z.string().uuid().nullable().optional(),
  unitCost: z.number().nonnegative().nullable().optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const upsertAdjustmentLineSchema = upsertInventoryLineSchema;
