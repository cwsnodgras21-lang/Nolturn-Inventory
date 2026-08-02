import { z } from "zod";
import { DATE_FORMATS, ONBOARDING_STEPS, STARTER_PACKS } from "@/modules/onboarding/types";

export const updateOnboardingDetailsSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  timezone: z.string().trim().min(1).max(64),
  dateFormat: z.enum(DATE_FORMATS),
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code"),
  contactEmail: z.string().trim().email().max(160).optional().or(z.literal("")),
  contactPhone: z.string().trim().max(40).optional().or(z.literal("")),
  contactAddress: z.string().trim().max(500).optional().or(z.literal("")),
});

export const updatePrimaryLocationSchema = z.object({
  locationId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(32).default("PRIMARY"),
  timezone: z.string().trim().min(1).max(64).optional().nullable(),
  addressLine1: z.string().trim().max(160).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  stateRegion: z.string().trim().max(80).optional().nullable(),
  postalCode: z.string().trim().max(24).optional().nullable(),
  countryCode: z.string().trim().max(2).optional().nullable(),
});

export const createInvitationSchema = z.object({
  email: z.string().trim().email().max(160),
  roleId: z.string().uuid(),
  locationAccessMode: z.enum(["all", "restricted"]).default("all"),
  locationIds: z.array(z.string().uuid()).default([]),
});

export const applyStarterSchema = z.object({
  starterPack: z.enum(STARTER_PACKS),
  demoDataEnabled: z.boolean().default(false),
});

export const updateModulesSchema = z.object({
  enabledModuleIds: z.array(z.string().min(1)).min(1),
});

export const setOnboardingStepSchema = z.object({
  step: z.enum(ONBOARDING_STEPS),
});

export const validateCsvImportSchema = z.object({
  csvText: z.string().min(1).max(500_000),
  fileName: z.string().trim().max(200).optional(),
});

export const commitCsvImportSchema = z.object({
  batchId: z.string().uuid(),
});
