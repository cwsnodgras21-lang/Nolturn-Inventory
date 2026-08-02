"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requirePermission, requireUser } from "@/lib/auth";
import { AppError, toSafeErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AUDIT_ACTIONS, writeAuditEvent } from "@/modules/audit";
import { validateItemCsvRows } from "@/modules/onboarding/csv";
import { requiredStepsComplete } from "@/modules/onboarding/checklist";
import {
  applyStarterSchema,
  commitCsvImportSchema,
  createInvitationSchema,
  setOnboardingStepSchema,
  updateModulesSchema,
  updateOnboardingDetailsSchema,
  updatePrimaryLocationSchema,
  validateCsvImportSchema,
} from "@/modules/onboarding/schemas";
import { STARTER_DEFINITIONS } from "@/modules/onboarding/starters";
import type { OnboardingStep } from "@/modules/onboarding/types";
import { getOnboardingState } from "@/modules/onboarding/queries";

export type OnboardingActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

function fail(error: unknown): OnboardingActionResult<never> {
  if (error instanceof AppError) {
    return { ok: false, error: error.message, code: error.code };
  }
  return { ok: false, error: toSafeErrorMessage(error) };
}

function revalidateOnboarding() {
  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  revalidatePath("/administration");
  revalidatePath("/administration/members");
}

async function touchOnboardingStep(
  organizationId: string,
  step: OnboardingStep,
  patch: Record<string, unknown>,
) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("organization_onboarding")
    .update({
      current_step: step,
      ...patch,
    })
    .eq("organization_id", organizationId)
    .neq("status", "completed");

  if (error) {
    throw new AppError("INTERNAL", "Unable to update onboarding progress.", 500);
  }
}

export async function saveOnboardingDetailsAction(
  raw: unknown,
): Promise<OnboardingActionResult> {
  try {
    const input = updateOnboardingDetailsSchema.parse(raw);
    const context = await requirePermission("organization.manage");
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from("organizations")
      .update({
        name: input.displayName,
        display_name: input.displayName,
        timezone: input.timezone,
        date_format: input.dateFormat,
        currency_code: input.currencyCode,
        contact_email: input.contactEmail || null,
        contact_phone: input.contactPhone || null,
        contact_address: input.contactAddress || null,
      })
      .eq("id", context.organizationId);

    if (error) {
      throw new AppError("INTERNAL", "Unable to save organization details.", 500);
    }

    await touchOnboardingStep(context.organizationId, "location", {
      details_completed_at: new Date().toISOString(),
    });

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.ONBOARDING_DETAILS_SAVED,
      entityType: "organization_onboarding",
      entityId: context.organizationId,
      summary: "Onboarding organization details saved",
      metadata: {
        timezone: input.timezone,
        currency_code: input.currencyCode,
        date_format: input.dateFormat,
      },
    });

    revalidateOnboarding();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function savePrimaryLocationAction(
  raw: unknown,
): Promise<OnboardingActionResult<{ locationId: string }>> {
  try {
    const input = updatePrimaryLocationSchema.parse(raw);
    const context = await requirePermission("locations.manage");
    const supabase = await createServerSupabaseClient();

    let locationId = input.locationId;

    if (locationId) {
      const { error } = await supabase
        .from("locations")
        .update({
          name: input.name,
          code: input.code,
          timezone: input.timezone ?? null,
          address_line_1: input.addressLine1 ?? null,
          city: input.city ?? null,
          state_region: input.stateRegion ?? null,
          postal_code: input.postalCode ?? null,
          country_code: input.countryCode ?? null,
          status: "active",
        })
        .eq("id", locationId)
        .eq("organization_id", context.organizationId);

      if (error) {
        throw new AppError("INTERNAL", "Unable to update primary location.", 500);
      }
    } else {
      const { data, error } = await supabase
        .from("locations")
        .insert({
          organization_id: context.organizationId,
          name: input.name,
          code: input.code,
          timezone: input.timezone ?? null,
          address_line_1: input.addressLine1 ?? null,
          city: input.city ?? null,
          state_region: input.stateRegion ?? null,
          postal_code: input.postalCode ?? null,
          country_code: input.countryCode ?? null,
          status: "active",
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new AppError(
          "VALIDATION",
          error?.message ?? "Unable to create primary location.",
          400,
        );
      }
      locationId = data.id;
    }

    await touchOnboardingStep(context.organizationId, "invite", {
      location_completed_at: new Date().toISOString(),
    });

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.ONBOARDING_LOCATION_SAVED,
      entityType: "location",
      entityId: locationId,
      summary: "Onboarding primary location configured",
      metadata: { code: input.code },
    });

    revalidateOnboarding();
    return { ok: true, data: { locationId } };
  } catch (error) {
    return fail(error);
  }
}

export async function createInvitationAction(
  raw: unknown,
): Promise<OnboardingActionResult<{ invitationId: string; acceptPath: string; token: string }>> {
  try {
    const input = createInvitationSchema.parse(raw);
    const context = await requirePermission("members.manage");
    const supabase = await createServerSupabaseClient();

    if (input.locationAccessMode === "restricted" && input.locationIds.length === 0) {
      throw new AppError(
        "VALIDATION",
        "Select at least one location for restricted access.",
        400,
      );
    }

    const { data: role } = await supabase
      .from("roles")
      .select("id, organization_id")
      .eq("id", input.roleId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (!role) {
      throw new AppError("VALIDATION", "Role not found in this organization.", 400);
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invitation, error } = await supabase
      .from("organization_invitations")
      .insert({
        organization_id: context.organizationId,
        email: input.email.trim(),
        role_id: input.roleId,
        location_access_mode: input.locationAccessMode,
        status: "pending",
        token_hash: tokenHash,
        invited_by: context.userId,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (error || !invitation) {
      if (error?.code === "23505") {
        throw new AppError(
          "VALIDATION",
          "A pending invitation already exists for that email.",
          400,
        );
      }
      throw new AppError("INTERNAL", error?.message ?? "Unable to create invitation.", 500);
    }

    if (input.locationAccessMode === "restricted") {
      const scopeRows = input.locationIds.map((locationId) => ({
        invitation_id: invitation.id,
        organization_id: context.organizationId,
        location_id: locationId,
      }));
      const { error: scopeError } = await supabase
        .from("organization_invitation_location_scopes")
        .insert(scopeRows);
      if (scopeError) {
        await supabase
          .from("organization_invitations")
          .update({
            status: "revoked",
            revoked_at: new Date().toISOString(),
            revoked_by: context.userId,
          })
          .eq("id", invitation.id);
        throw new AppError("VALIDATION", "Unable to assign invitation locations.", 400);
      }
    }

    await supabase
      .from("organization_onboarding")
      .update({
        invite_completed_at: new Date().toISOString(),
        invite_skipped: false,
        current_step: "starter",
      })
      .eq("organization_id", context.organizationId)
      .neq("status", "completed");

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.MEMBERSHIP_INVITATION_CREATED,
      entityType: "organization_invitation",
      entityId: invitation.id,
      summary: `Invitation created for ${input.email}`,
      metadata: {
        email: input.email,
        role_id: input.roleId,
        location_access_mode: input.locationAccessMode,
      },
    });

    revalidateOnboarding();
    return {
      ok: true,
      data: {
        invitationId: invitation.id,
        acceptPath: `/invitations/accept?token=${token}`,
        token,
      },
    };
  } catch (error) {
    return fail(error);
  }
}

export async function skipInviteStepAction(): Promise<OnboardingActionResult> {
  try {
    const context = await requirePermission("organization.manage");
    await touchOnboardingStep(context.organizationId, "starter", {
      invite_skipped: true,
      invite_completed_at: null,
    });
    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.ONBOARDING_STEP_SKIPPED,
      entityType: "organization_onboarding",
      entityId: context.organizationId,
      summary: "Onboarding invite step skipped",
      metadata: { step: "invite" },
    });
    revalidateOnboarding();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function revokeInvitationAction(
  invitationId: string,
): Promise<OnboardingActionResult> {
  try {
    await requirePermission("members.manage");
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.rpc("revoke_organization_invitation", {
      p_invitation_id: invitationId,
    });
    if (error) {
      throw new AppError("VALIDATION", error.message, 400);
    }
    revalidateOnboarding();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function acceptInvitationAction(
  token: string,
): Promise<OnboardingActionResult<{ organizationId: string }>> {
  try {
    await requireUser();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("accept_organization_invitation", {
      p_token: token,
    });
    if (error || !data) {
      throw new AppError("VALIDATION", error?.message ?? "Unable to accept invitation.", 400);
    }
    revalidatePath("/", "layout");
    return { ok: true, data: { organizationId: data } };
  } catch (error) {
    return fail(error);
  }
}

export async function applyStarterConfigurationAction(
  raw: unknown,
): Promise<OnboardingActionResult<{ unitsCreated: number; categoriesCreated: number }>> {
  try {
    const input = applyStarterSchema.parse(raw);
    const context = await requirePermission("organization.manage");
    await requirePermission("catalog.manage");
    const supabase = await createServerSupabaseClient();
    const pack = STARTER_DEFINITIONS[input.starterPack];

    let unitsCreated = 0;
    let categoriesCreated = 0;

    for (const unit of pack.units) {
      const { data: existing } = await supabase
        .from("units_of_measure")
        .select("id")
        .eq("organization_id", context.organizationId)
        .ilike("symbol", unit.symbol)
        .maybeSingle();
      if (existing) continue;

      const { error } = await supabase.from("units_of_measure").insert({
        organization_id: context.organizationId,
        name: unit.name,
        symbol: unit.symbol,
        dimension: unit.dimension,
        precision: unit.precision,
        unit_kind: unit.unitKind,
        status: "active",
        is_system: false,
        created_by: context.userId,
      });
      if (!error) unitsCreated += 1;
    }

    for (const category of pack.categories) {
      let parentId: string | null = null;
      const { data: existingParent } = await supabase
        .from("item_categories")
        .select("id")
        .eq("organization_id", context.organizationId)
        .ilike("name", category.name)
        .maybeSingle();

      if (existingParent) {
        parentId = existingParent.id;
      } else {
        const { data: created, error } = await supabase
          .from("item_categories")
          .insert({
            organization_id: context.organizationId,
            name: category.name,
            status: "active",
            sort_order: 0,
            created_by: context.userId,
          })
          .select("id")
          .single();
        if (!error && created) {
          parentId = created.id;
          categoriesCreated += 1;
        }
      }

      for (const childName of category.children ?? []) {
        const { data: existingChild } = await supabase
          .from("item_categories")
          .select("id")
          .eq("organization_id", context.organizationId)
          .ilike("name", childName)
          .maybeSingle();
        if (existingChild) continue;

        const { error } = await supabase.from("item_categories").insert({
          organization_id: context.organizationId,
          parent_id: parentId,
          name: childName,
          status: "active",
          sort_order: 0,
          created_by: context.userId,
        });
        if (!error) categoriesCreated += 1;
      }
    }

    const { data: locations } = await supabase
      .from("locations")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1);

    const primaryLocationId = locations?.[0]?.id;
    if (primaryLocationId && pack.storage.length > 0) {
      await requirePermission("inventory.storage.manage");
      for (const area of pack.storage) {
        const { data: existingArea } = await supabase
          .from("storage_areas")
          .select("id")
          .eq("location_id", primaryLocationId)
          .ilike("code", area.code)
          .maybeSingle();

        let parentAreaId = existingArea?.id ?? null;
        if (!parentAreaId) {
          const { data: createdArea } = await supabase
            .from("storage_areas")
            .insert({
              organization_id: context.organizationId,
              location_id: primaryLocationId,
              name: area.name,
              code: area.code,
              area_type: area.areaType,
              status: "active",
              sort_order: 0,
              created_by: context.userId,
            })
            .select("id")
            .single();
          parentAreaId = createdArea?.id ?? null;
        }

        for (const child of area.children ?? []) {
          const { data: existingChild } = await supabase
            .from("storage_areas")
            .select("id")
            .eq("location_id", primaryLocationId)
            .ilike("code", child.code)
            .maybeSingle();
          if (existingChild || !parentAreaId) continue;
          await supabase.from("storage_areas").insert({
            organization_id: context.organizationId,
            location_id: primaryLocationId,
            parent_id: parentAreaId,
            name: child.name,
            code: child.code,
            area_type: child.areaType,
            status: "active",
            sort_order: 0,
            created_by: context.userId,
          });
        }
      }
    }

    if (input.demoDataEnabled && pack.demoItems.length > 0) {
      const { data: units } = await supabase
        .from("units_of_measure")
        .select("id, symbol")
        .eq("organization_id", context.organizationId);
      const { data: categories } = await supabase
        .from("item_categories")
        .select("id, name")
        .eq("organization_id", context.organizationId);

      const unitBySymbol = new Map(
        (units ?? []).map((u) => [u.symbol.toLowerCase(), u.id] as const),
      );
      const categoryByName = new Map(
        (categories ?? []).map((c) => [c.name.toLowerCase(), c.id] as const),
      );

      for (const item of pack.demoItems) {
        const { data: existing } = await supabase
          .from("items")
          .select("id")
          .eq("organization_id", context.organizationId)
          .ilike("sku", item.sku)
          .maybeSingle();
        if (existing) continue;

        const unitId = unitBySymbol.get(item.baseUnitSymbol.toLowerCase());
        if (!unitId) continue;

        await supabase.from("items").insert({
          organization_id: context.organizationId,
          name: item.name,
          sku: item.sku,
          description: item.description ?? null,
          category_id: categoryByName.get(item.categoryName.toLowerCase()) ?? null,
          base_unit_id: unitId,
          default_entry_unit_id: unitId,
          status: "active",
          requires_variant: false,
          allow_negative_stock: false,
          created_by: context.userId,
        });
      }
    }

    await supabase
      .from("organization_onboarding")
      .update({
        starter_pack: input.starterPack,
        demo_data_enabled: input.demoDataEnabled,
        starter_completed_at: new Date().toISOString(),
        current_step: "catalog",
      })
      .eq("organization_id", context.organizationId)
      .neq("status", "completed");

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.ONBOARDING_STARTER_APPLIED,
      entityType: "organization_onboarding",
      entityId: context.organizationId,
      summary: `Starter configuration applied: ${input.starterPack}`,
      metadata: {
        starter_pack: input.starterPack,
        demo_data_enabled: input.demoDataEnabled,
        units_created: unitsCreated,
        categories_created: categoriesCreated,
      },
    });

    revalidateOnboarding();
    revalidatePath("/administration/catalog/units");
    revalidatePath("/administration/catalog/categories");
    revalidatePath("/administration/storage");
    return { ok: true, data: { unitsCreated, categoriesCreated } };
  } catch (error) {
    return fail(error);
  }
}

export async function skipCatalogStepAction(): Promise<OnboardingActionResult> {
  try {
    const context = await requirePermission("organization.manage");
    await touchOnboardingStep(context.organizationId, "modules", {
      catalog_skipped: true,
      catalog_completed_at: null,
    });
    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.ONBOARDING_STEP_SKIPPED,
      entityType: "organization_onboarding",
      entityId: context.organizationId,
      summary: "Onboarding catalog step skipped",
      metadata: { step: "catalog" },
    });
    revalidateOnboarding();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function markCatalogStepCompleteAction(): Promise<OnboardingActionResult> {
  try {
    const context = await requirePermission("organization.manage");
    await touchOnboardingStep(context.organizationId, "modules", {
      catalog_skipped: false,
      catalog_completed_at: new Date().toISOString(),
    });
    revalidateOnboarding();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function saveModulesAction(raw: unknown): Promise<OnboardingActionResult> {
  try {
    const input = updateModulesSchema.parse(raw);
    const context = await requirePermission("organization.manage");
    const supabase = await createServerSupabaseClient();

    const { data: definitions } = await supabase
      .from("module_definitions")
      .select("id, dependencies, is_core");

    const defMap = new Map((definitions ?? []).map((d) => [d.id, d]));
    const enabled = new Set(input.enabledModuleIds);

    for (const def of definitions ?? []) {
      if (def.is_core) enabled.add(def.id);
    }

    for (const moduleId of enabled) {
      const def = defMap.get(moduleId);
      if (!def) {
        throw new AppError("VALIDATION", `Unknown module: ${moduleId}`, 400);
      }
      for (const dep of def.dependencies ?? []) {
        if (!enabled.has(dep)) {
          throw new AppError(
            "VALIDATION",
            `Module ${moduleId} requires ${dep} to be enabled.`,
            400,
          );
        }
      }
    }

    const { data: existing } = await supabase
      .from("organization_modules")
      .select("id, module_id, status")
      .eq("organization_id", context.organizationId);

    const existingByModule = new Map((existing ?? []).map((row) => [row.module_id, row]));

    for (const def of definitions ?? []) {
      const shouldEnable = enabled.has(def.id);
      const row = existingByModule.get(def.id);
      if (row) {
        await supabase
          .from("organization_modules")
          .update({
            status: shouldEnable ? "enabled" : "disabled",
            enabled_at: shouldEnable ? new Date().toISOString() : null,
            enabled_by: shouldEnable ? context.userId : null,
          })
          .eq("id", row.id);
      } else {
        await supabase.from("organization_modules").insert({
          organization_id: context.organizationId,
          module_id: def.id,
          status: shouldEnable ? "enabled" : "disabled",
          enabled_at: shouldEnable ? new Date().toISOString() : null,
          enabled_by: shouldEnable ? context.userId : null,
        });
      }
    }

    await touchOnboardingStep(context.organizationId, "review", {
      modules_completed_at: new Date().toISOString(),
    });

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.ONBOARDING_MODULES_UPDATED,
      entityType: "organization_onboarding",
      entityId: context.organizationId,
      summary: "Organization modules updated during onboarding",
      metadata: { enabled_module_ids: [...enabled] },
    });

    revalidateOnboarding();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function setOnboardingStepAction(raw: unknown): Promise<OnboardingActionResult> {
  try {
    const input = setOnboardingStepSchema.parse(raw);
    const context = await requirePermission("organization.manage");
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("organization_onboarding")
      .update({ current_step: input.step })
      .eq("organization_id", context.organizationId)
      .neq("status", "completed");
    if (error) {
      throw new AppError("INTERNAL", "Unable to set onboarding step.", 500);
    }
    revalidateOnboarding();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function completeOnboardingAction(): Promise<OnboardingActionResult> {
  try {
    const context = await requirePermission("organization.manage");
    const state = await getOnboardingState(context.organizationId);
    if (!state) {
      throw new AppError("VALIDATION", "Onboarding state not found.", 400);
    }
    if (state.status === "completed") {
      return { ok: true, data: undefined };
    }
    if (!requiredStepsComplete(state)) {
      throw new AppError(
        "VALIDATION",
        "Finish required setup steps before completing onboarding.",
        400,
      );
    }

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("organization_onboarding")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: context.userId,
        current_step: "review",
      })
      .eq("organization_id", context.organizationId)
      .eq("status", "in_progress");

    if (error) {
      throw new AppError("INTERNAL", "Unable to complete onboarding.", 500);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.ONBOARDING_COMPLETED,
      entityType: "organization_onboarding",
      entityId: context.organizationId,
      summary: "Organization onboarding completed",
    });

    revalidateOnboarding();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function validateCsvImportAction(
  raw: unknown,
): Promise<
  OnboardingActionResult<{
    batchId: string;
    validCount: number;
    errorCount: number;
    errors: Array<{ rowNumber: number; field?: string; message: string }>;
    warnings: Array<{ rowNumber: number; field?: string; message: string }>;
    preview: Array<{ rowNumber: number; name: string; sku: string }>;
  }>
> {
  try {
    const input = validateCsvImportSchema.parse(raw);
    const context = await requirePermission("catalog.manage");
    const supabase = await createServerSupabaseClient();

    const [{ data: items }, { data: units }, { data: categories }] = await Promise.all([
      supabase.from("items").select("sku").eq("organization_id", context.organizationId),
      supabase
        .from("units_of_measure")
        .select("symbol")
        .eq("organization_id", context.organizationId)
        .eq("status", "active"),
      supabase
        .from("item_categories")
        .select("name")
        .eq("organization_id", context.organizationId)
        .eq("status", "active"),
    ]);

    const result = validateItemCsvRows(input.csvText, {
      existingSkus: new Set((items ?? []).map((i) => i.sku.toLowerCase())),
      unitSymbols: new Set((units ?? []).map((u) => u.symbol.toLowerCase())),
      categoryNames: new Set((categories ?? []).map((c) => c.name.toLowerCase())),
    });

    const { data: batch, error } = await supabase
      .from("catalog_import_batches")
      .insert({
        organization_id: context.organizationId,
        status: result.errorCount === 0 ? "validated" : "failed",
        mode: "all_or_nothing",
        file_name: input.fileName ?? null,
        row_count: result.rows.length + result.errors.filter((e) => e.rowNumber > 1).length,
        valid_count: result.validCount,
        error_count: result.errorCount,
        preview: JSON.parse(JSON.stringify(result.rows)) as import("@/lib/supabase/types").Json,
        error_summary: JSON.parse(JSON.stringify(result.errors)) as import("@/lib/supabase/types").Json,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (error || !batch) {
      throw new AppError("INTERNAL", "Unable to store import preview.", 500);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.CATALOG_IMPORT_VALIDATED,
      entityType: "catalog_import_batch",
      entityId: batch.id,
      summary: "Catalog CSV import validated",
      metadata: {
        valid_count: result.validCount,
        error_count: result.errorCount,
      },
    });

    return {
      ok: true,
      data: {
        batchId: batch.id,
        validCount: result.validCount,
        errorCount: result.errorCount,
        errors: result.errors,
        warnings: result.warnings,
        preview: result.rows.slice(0, 20).map((r) => ({
          rowNumber: r.rowNumber,
          name: r.name,
          sku: r.sku,
        })),
      },
    };
  } catch (error) {
    return fail(error);
  }
}

export async function commitCsvImportAction(
  raw: unknown,
): Promise<OnboardingActionResult<{ committedCount: number }>> {
  try {
    const input = commitCsvImportSchema.parse(raw);
    const context = await requirePermission("catalog.manage");
    const supabase = await createServerSupabaseClient();

    const { data: batch, error: batchError } = await supabase
      .from("catalog_import_batches")
      .select("*")
      .eq("id", input.batchId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (batchError || !batch) {
      throw new AppError("VALIDATION", "Import batch not found.", 400);
    }
    if (batch.status !== "validated") {
      throw new AppError(
        "VALIDATION",
        "Only a validated import with zero errors can be committed (all-or-nothing).",
        400,
      );
    }

    const preview = batch.preview as unknown as Array<{
      name: string;
      sku: string;
      baseUnit: string;
      entryUnit: string;
      category: string | null;
      description: string | null;
    }>;

    const [{ data: units }, { data: categories }] = await Promise.all([
      supabase
        .from("units_of_measure")
        .select("id, symbol")
        .eq("organization_id", context.organizationId),
      supabase
        .from("item_categories")
        .select("id, name")
        .eq("organization_id", context.organizationId),
    ]);

    const unitBySymbol = new Map(
      (units ?? []).map((u) => [u.symbol.toLowerCase(), u.id] as const),
    );
    const categoryByName = new Map(
      (categories ?? []).map((c) => [c.name.toLowerCase(), c.id] as const),
    );

    const createdIds: string[] = [];
    try {
      for (const row of preview) {
        const baseUnitId = unitBySymbol.get(row.baseUnit.toLowerCase());
        const entryUnitId = unitBySymbol.get(row.entryUnit.toLowerCase());
        if (!baseUnitId || !entryUnitId) {
          throw new AppError("VALIDATION", `Missing unit for SKU ${row.sku}`, 400);
        }
        const { data: created, error } = await supabase
          .from("items")
          .insert({
            organization_id: context.organizationId,
            name: row.name,
            sku: row.sku,
            description: row.description,
            category_id: row.category
              ? (categoryByName.get(row.category.toLowerCase()) ?? null)
              : null,
            base_unit_id: baseUnitId,
            default_entry_unit_id: entryUnitId,
            status: "active",
            requires_variant: false,
            allow_negative_stock: false,
            created_by: context.userId,
          })
          .select("id")
          .single();
        if (error || !created) {
          throw new AppError("VALIDATION", error?.message ?? `Failed importing ${row.sku}`, 400);
        }
        createdIds.push(created.id);
      }
    } catch (error) {
      if (createdIds.length > 0) {
        await supabase.from("items").delete().in("id", createdIds);
      }
      await supabase
        .from("catalog_import_batches")
        .update({ status: "failed" })
        .eq("id", batch.id);
      throw error;
    }

    await supabase
      .from("catalog_import_batches")
      .update({
        status: "committed",
        committed_count: createdIds.length,
        committed_at: new Date().toISOString(),
      })
      .eq("id", batch.id);

    await supabase
      .from("organization_onboarding")
      .update({
        catalog_completed_at: new Date().toISOString(),
        catalog_skipped: false,
        current_step: "modules",
      })
      .eq("organization_id", context.organizationId)
      .neq("status", "completed");

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.CATALOG_IMPORT_COMMITTED,
      entityType: "catalog_import_batch",
      entityId: batch.id,
      summary: `Catalog CSV import committed (${createdIds.length} items)`,
      metadata: { committed_count: createdIds.length, mode: "all_or_nothing" },
    });

    revalidateOnboarding();
    revalidatePath("/administration/catalog/items");
    return { ok: true, data: { committedCount: createdIds.length } };
  } catch (error) {
    return fail(error);
  }
}

export async function uploadOrganizationLogoAction(
  formData: FormData,
): Promise<OnboardingActionResult<{ path: string }>> {
  try {
    const context = await requirePermission("organization.manage");
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION", "Logo file is required.", 400);
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new AppError("VALIDATION", "Logo must be 2MB or smaller.", 400);
    }
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      throw new AppError("VALIDATION", "Logo must be PNG, JPEG, or WebP.", 400);
    }

    const ext =
      file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${context.organizationId}/logo.${ext}`;
    const supabase = await createServerSupabaseClient();
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("org-logos")
      .upload(path, buffer, { contentType: file.type, upsert: true });

    if (uploadError) {
      throw new AppError("INTERNAL", uploadError.message, 500);
    }

    const { error } = await supabase
      .from("organizations")
      .update({ logo_path: path })
      .eq("id", context.organizationId);

    if (error) {
      throw new AppError("INTERNAL", "Unable to save logo path.", 500);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.ORGANIZATION_LOGO_UPDATED,
      entityType: "organization",
      entityId: context.organizationId,
      summary: "Organization logo uploaded",
      metadata: { path },
    });

    revalidateOnboarding();
    return { ok: true, data: { path } };
  } catch (error) {
    return fail(error);
  }
}

export async function getOrganizationLogoSignedUrlAction(): Promise<
  OnboardingActionResult<{ url: string | null }>
> {
  try {
    const context = await requirePermission("organization.read");
    const supabase = await createServerSupabaseClient();
    const { data: org } = await supabase
      .from("organizations")
      .select("logo_path")
      .eq("id", context.organizationId)
      .single();

    if (!org?.logo_path) {
      return { ok: true, data: { url: null } };
    }

    const { data, error } = await supabase.storage
      .from("org-logos")
      .createSignedUrl(org.logo_path, 60 * 30);

    if (error) {
      throw new AppError("INTERNAL", "Unable to create logo URL.", 500);
    }

    return { ok: true, data: { url: data.signedUrl } };
  } catch (error) {
    return fail(error);
  }
}
