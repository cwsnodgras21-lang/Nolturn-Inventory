import { z } from "zod";
import { LOT_STATUSES, TRACKING_MODES } from "@/modules/lots/types";

export const createLotSchema = z.object({
  itemId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  lotNumber: z.string().trim().min(1).max(120),
  expirationDate: z.string().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(LOT_STATUSES).default("active"),
});

export const updateLotSchema = z.object({
  lotNumber: z.string().trim().min(1).max(120).optional(),
  expirationDate: z.string().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(LOT_STATUSES).optional(),
});

export const updateItemTrackingModeSchema = z.object({
  trackingMode: z.enum(TRACKING_MODES),
});
