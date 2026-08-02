import { z } from "zod";

export const createCountSessionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  locationIds: z.array(z.string().uuid()).min(1),
  blindCountEnabled: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const updateCountSessionSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  blindCountEnabled: z.boolean().optional(),
  locationIds: z.array(z.string().uuid()).min(1).optional(),
});

export const recordCountLineSchema = z.object({
  countedQuantity: z.number().nonnegative(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const addCountLineSchema = z.object({
  itemId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  lotId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid(),
  storageAreaId: z.string().uuid(),
  binId: z.string().uuid().nullable().optional(),
  countedQuantity: z.number().nonnegative().optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const reviewCountLineSchema = z.object({
  decision: z.enum(["accepted", "rejected"]),
});
