import { z } from "zod";
import { RECALL_SEVERITIES, RECALL_STATUSES } from "@/modules/recalls/types";

export const createRecallSchema = z.object({
  title: z.string().trim().min(1).max(200),
  recallNumber: z.string().trim().min(1).max(120),
  externalReference: z.string().trim().max(200).optional().nullable(),
  source: z.string().trim().min(1).max(120).default("internal"),
  severity: z.enum(RECALL_SEVERITIES).default("medium"),
  announcedDate: z.string().optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

export const updateRecallSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  externalReference: z.string().trim().max(200).optional().nullable(),
  source: z.string().trim().min(1).max(120).optional(),
  severity: z.enum(RECALL_SEVERITIES).optional(),
  announcedDate: z.string().optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

export const recallStatusSchema = z.object({
  status: z.enum(RECALL_STATUSES),
});

export const attachRecallLotSchema = z.object({
  lotId: z.string().uuid(),
});
