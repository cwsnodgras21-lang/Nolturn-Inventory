import { z } from "zod";
import { STORAGE_AREA_TYPES, STORAGE_STATUSES } from "@/modules/storage/types";

export const createStorageAreaSchema = z.object({
  locationId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(64).optional().nullable(),
  areaType: z.enum(STORAGE_AREA_TYPES),
  status: z.enum(STORAGE_STATUSES).default("active"),
  sortOrder: z.number().int().default(0),
});

export const updateStorageAreaSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  code: z.string().trim().min(1).max(64).optional().nullable(),
  areaType: z.enum(STORAGE_AREA_TYPES).optional(),
  status: z.enum(STORAGE_STATUSES).optional(),
  sortOrder: z.number().int().optional(),
});

export const reparentStorageAreaSchema = z.object({
  parentId: z.string().uuid().nullable(),
});

export const changeStorageAreaStatusSchema = z.object({
  status: z.enum(STORAGE_STATUSES),
});

export const createStorageBinSchema = z.object({
  storageAreaId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(64).optional().nullable(),
  status: z.enum(STORAGE_STATUSES).default("active"),
  sortOrder: z.number().int().default(0),
});

export const updateStorageBinSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  code: z.string().trim().min(1).max(64).optional().nullable(),
  status: z.enum(STORAGE_STATUSES).optional(),
  sortOrder: z.number().int().optional(),
});

export const changeStorageBinStatusSchema = z.object({
  status: z.enum(STORAGE_STATUSES),
});
