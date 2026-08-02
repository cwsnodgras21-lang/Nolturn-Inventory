import { z } from "zod";
import { REORDER_STATUSES } from "@/modules/reorder/types";

export const upsertReorderRuleSchema = z
  .object({
    itemId: z.string().uuid(),
    variantId: z.string().uuid().nullable().optional(),
    locationId: z.string().uuid().nullable().optional(),
    minimumQuantity: z.number().nonnegative(),
    targetQuantity: z.number().nonnegative(),
    reorderQuantity: z.number().positive().nullable().optional(),
    preferredSupplierId: z.string().uuid().nullable().optional(),
    status: z.enum(REORDER_STATUSES).default("active"),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((value) => value.targetQuantity >= value.minimumQuantity, {
    message: "Target quantity must be greater than or equal to minimum quantity.",
    path: ["targetQuantity"],
  });

export const updateReorderRuleSchema = z
  .object({
    minimumQuantity: z.number().nonnegative().optional(),
    targetQuantity: z.number().nonnegative().optional(),
    reorderQuantity: z.number().positive().nullable().optional(),
    preferredSupplierId: z.string().uuid().nullable().optional(),
    status: z.enum(REORDER_STATUSES).optional(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .refine(
    (value) => {
      if (value.minimumQuantity === undefined || value.targetQuantity === undefined) return true;
      return value.targetQuantity >= value.minimumQuantity;
    },
    {
      message: "Target quantity must be greater than or equal to minimum quantity.",
      path: ["targetQuantity"],
    },
  );

export const createRestockDraftOrdersSchema = z.object({
  requestKey: z.string().trim().min(8).max(120),
  selections: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        variantId: z.string().uuid().nullable().optional(),
        locationId: z.string().uuid(),
        supplierId: z.string().uuid(),
        suggestedQuantity: z.number().positive(),
        purchaseUnitId: z.string().uuid(),
        ruleId: z.string().uuid().optional(),
      }),
    )
    .min(1),
});
