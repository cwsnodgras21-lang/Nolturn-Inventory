import { z } from "zod";
import {
  CATALOG_STATUSES,
  IDENTIFIER_TYPES,
  UNIT_DIMENSIONS,
  UNIT_KINDS,
} from "@/modules/catalog/types";

export const createUnitSchema = z.object({
  name: z.string().trim().min(1).max(80),
  symbol: z.string().trim().min(1).max(24),
  dimension: z.enum(UNIT_DIMENSIONS),
  precision: z.number().int().min(0).max(6).default(0),
  unitKind: z.enum(UNIT_KINDS),
  status: z.enum(CATALOG_STATUSES).default("active"),
});

export const updateUnitSchema = createUnitSchema.partial().extend({
  status: z.enum(CATALOG_STATUSES).optional(),
});

export const changeUnitStatusSchema = z.object({
  status: z.enum(CATALOG_STATUSES),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().default(0),
  status: z.enum(CATALOG_STATUSES).default("active"),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  sortOrder: z.number().int().optional(),
  status: z.enum(CATALOG_STATUSES).optional(),
});

export const reparentCategorySchema = z.object({
  parentId: z.string().uuid().nullable(),
});

export const changeCategoryStatusSchema = z.object({
  status: z.enum(CATALOG_STATUSES),
});

export const createItemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  categoryId: z.string().uuid().nullable().optional(),
  baseUnitId: z.string().uuid(),
  defaultEntryUnitId: z.string().uuid(),
  sku: z.string().trim().min(1).max(64),
  status: z.enum(CATALOG_STATUSES).default("active"),
  requiresVariant: z.boolean().default(false),
  allowNegativeStock: z.boolean().default(false),
});

export const updateItemSchema = createItemSchema.partial();

export const createVariantSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().min(1).max(64).optional().nullable(),
  status: z.enum(CATALOG_STATUSES).default("active"),
});

export const updateVariantSchema = createVariantSchema.partial();

export const createConversionSchema = z.object({
  fromUnitId: z.string().uuid(),
  multiplier: z.number().positive(),
});

export const createIdentifierSchema = z.object({
  identifierType: z.enum(IDENTIFIER_TYPES),
  valueDisplay: z.string().trim().min(1).max(128),
  variantId: z.string().uuid().nullable().optional(),
  isPrimary: z.boolean().default(false),
});

export const updateIdentifierSchema = z.object({
  identifierType: z.enum(IDENTIFIER_TYPES).optional(),
  valueDisplay: z.string().trim().min(1).max(128).optional(),
  isPrimary: z.boolean().optional(),
});
