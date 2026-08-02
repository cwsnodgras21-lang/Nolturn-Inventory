import { z } from "zod";

export const createLocationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((value) => (value ? value.toUpperCase() : undefined)),
  timezone: z.string().trim().min(1).max(64).optional(),
  countryCode: z.string().trim().length(2).optional(),
  addressLine1: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  stateRegion: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(32).optional(),
});

export const updateLocationSchema = createLocationSchema.partial().extend({
  status: z.enum(["active", "inactive", "archived"]).optional(),
});
