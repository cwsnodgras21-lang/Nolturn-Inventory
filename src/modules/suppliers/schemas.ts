import { z } from "zod";
import { SUPPLIER_STATUSES } from "@/modules/suppliers/types";

const optionalEmail = z
  .union([z.string().trim().email().max(200), z.literal(""), z.null()])
  .optional();

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: optionalEmail,
  phone: z.string().trim().max(50).optional().nullable(),
  website: z.string().trim().max(300).optional().nullable(),
  accountNumber: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(SUPPLIER_STATUSES).default("active"),
});

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  status: z.enum(SUPPLIER_STATUSES).optional(),
});

export const supplierContactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: optionalEmail,
  phone: z.string().trim().max(50).optional().nullable(),
  title: z.string().trim().max(120).optional().nullable(),
  isPrimary: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional().nullable(),
});
