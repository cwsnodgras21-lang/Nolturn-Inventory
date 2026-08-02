import { z } from "zod";

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  timezone: z.string().trim().min(1).max(64).default("America/Chicago"),
  createDefaultLocation: z.boolean().default(true),
});

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  status: z.enum(["active", "suspended", "archived"]).optional(),
  displayName: z.string().trim().min(2).max(120).optional(),
  dateFormat: z.enum(["MM/dd/yyyy", "dd/MM/yyyy", "yyyy-MM-dd"]).optional(),
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .optional(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
