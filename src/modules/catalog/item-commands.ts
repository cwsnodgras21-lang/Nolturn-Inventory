"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { AppError, toSafeErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AUDIT_ACTIONS, writeAuditEvent } from "@/modules/audit";
import type { CatalogActionResult } from "@/modules/catalog/commands";
import { mapDbError } from "@/modules/catalog/mappers";
import {
  createConversionSchema,
  createIdentifierSchema,
  createItemSchema,
  createVariantSchema,
  updateIdentifierSchema,
  updateItemSchema,
  updateVariantSchema,
} from "@/modules/catalog/schemas";

function fail(error: unknown): CatalogActionResult<never> {
  if (error instanceof AppError) {
    return { ok: false, error: error.message, code: error.code };
  }
  return { ok: false, error: toSafeErrorMessage(error) };
}

function revalidateItemPaths(itemId?: string) {
  revalidatePath("/administration/catalog/items");
  if (itemId) {
    revalidatePath(`/administration/catalog/items/${itemId}`);
    revalidatePath(`/administration/catalog/items/${itemId}/edit`);
  }
}

async function assertEntryUnitConvertible(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  organizationId: string,
  itemId: string | null,
  baseUnitId: string,
  defaultEntryUnitId: string,
) {
  if (defaultEntryUnitId === baseUnitId) return;

  let query = supabase
    .from("item_unit_conversions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("from_unit_id", defaultEntryUnitId)
    .eq("to_unit_id", baseUnitId)
    .limit(1);

  if (itemId) {
    query = query.eq("item_id", itemId);
  }

  const { data } = await query.maybeSingle();
  if (!data && itemId) {
    throw new AppError(
      "VALIDATION",
      "Default entry unit differs from base unit — add a conversion to the base unit first.",
      400,
    );
  }
  // On create, conversion cannot exist yet; allow create then require conversion before using entry unit.
}

export async function createItemAction(
  raw: unknown,
): Promise<CatalogActionResult<{ id: string }>> {
  try {
    const input = createItemSchema.parse(raw);
    const context = await requirePermission("catalog.manage");
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("items")
      .insert({
        organization_id: context.organizationId,
        name: input.name,
        description: input.description ?? null,
        category_id: input.categoryId ?? null,
        base_unit_id: input.baseUnitId,
        default_entry_unit_id: input.defaultEntryUnitId,
        sku: input.sku,
        status: input.status,
        requires_variant: input.requiresVariant,
        allow_negative_stock: input.allowNegativeStock,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new AppError("VALIDATION", mapDbError(error?.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.CATALOG_ITEM_CREATED,
      entityType: "item",
      entityId: data.id,
      summary: `Item created: ${input.name}`,
      metadata: {
        sku: input.sku,
        baseUnitId: input.baseUnitId,
        defaultEntryUnitId: input.defaultEntryUnitId,
        requiresVariant: input.requiresVariant,
      },
    });

    revalidateItemPaths(data.id);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateItemAction(
  itemId: string,
  raw: unknown,
): Promise<CatalogActionResult> {
  try {
    const input = updateItemSchema.parse(raw);
    const context = await requirePermission("catalog.manage");
    const supabase = await createServerSupabaseClient();

    const { data: existing, error: existingError } = await supabase
      .from("items")
      .select("id, status, base_unit_id, default_entry_unit_id")
      .eq("id", itemId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (existingError || !existing) {
      throw new AppError("NOT_FOUND", "Item not found.", 404);
    }

    const nextBase = input.baseUnitId ?? existing.base_unit_id;
    const nextEntry = input.defaultEntryUnitId ?? existing.default_entry_unit_id;
    await assertEntryUnitConvertible(
      supabase,
      context.organizationId,
      itemId,
      nextBase,
      nextEntry,
    );

    const { error } = await supabase
      .from("items")
      .update({
        ...(input.name ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.categoryId !== undefined ? { category_id: input.categoryId } : {}),
        ...(input.baseUnitId ? { base_unit_id: input.baseUnitId } : {}),
        ...(input.defaultEntryUnitId
          ? { default_entry_unit_id: input.defaultEntryUnitId }
          : {}),
        ...(input.sku ? { sku: input.sku } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.requiresVariant !== undefined
          ? { requires_variant: input.requiresVariant }
          : {}),
        ...(input.allowNegativeStock !== undefined
          ? { allow_negative_stock: input.allowNegativeStock }
          : {}),
      })
      .eq("id", itemId)
      .eq("organization_id", context.organizationId);

    if (error) {
      throw new AppError("VALIDATION", mapDbError(error.message), 400);
    }

    const statusChanged = input.status && input.status !== existing.status;
    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: statusChanged
        ? AUDIT_ACTIONS.CATALOG_ITEM_STATUS_CHANGED
        : AUDIT_ACTIONS.CATALOG_ITEM_UPDATED,
      entityType: "item",
      entityId: itemId,
      summary: statusChanged
        ? `Item status changed to ${input.status}`
        : "Item updated",
      metadata: {
        previousStatus: existing.status,
        status: input.status ?? existing.status,
        name: input.name,
        sku: input.sku,
      },
    });

    revalidateItemPaths(itemId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function createVariantAction(
  itemId: string,
  raw: unknown,
): Promise<CatalogActionResult<{ id: string }>> {
  try {
    const input = createVariantSchema.parse(raw);
    const context = await requirePermission("catalog.manage");
    const supabase = await createServerSupabaseClient();

    const { data: item } = await supabase
      .from("items")
      .select("id")
      .eq("id", itemId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();
    if (!item) {
      throw new AppError("NOT_FOUND", "Item not found.", 404);
    }

    const { data, error } = await supabase
      .from("item_variants")
      .insert({
        organization_id: context.organizationId,
        item_id: itemId,
        name: input.name,
        sku: input.sku?.trim() ? input.sku : null,
        status: input.status,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new AppError("VALIDATION", mapDbError(error?.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.CATALOG_VARIANT_CREATED,
      entityType: "item_variant",
      entityId: data.id,
      summary: `Variant created: ${input.name}`,
      metadata: { itemId, sku: input.sku ?? null },
    });

    revalidateItemPaths(itemId);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateVariantAction(
  itemId: string,
  variantId: string,
  raw: unknown,
): Promise<CatalogActionResult> {
  try {
    const input = updateVariantSchema.parse(raw);
    const context = await requirePermission("catalog.manage");
    const supabase = await createServerSupabaseClient();

    const { data: existing, error: existingError } = await supabase
      .from("item_variants")
      .select("id, status")
      .eq("id", variantId)
      .eq("item_id", itemId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (existingError || !existing) {
      throw new AppError("NOT_FOUND", "Variant not found.", 404);
    }

    const { error } = await supabase
      .from("item_variants")
      .update({
        ...(input.name ? { name: input.name } : {}),
        ...(input.sku !== undefined
          ? { sku: input.sku?.trim() ? input.sku : null }
          : {}),
        ...(input.status ? { status: input.status } : {}),
      })
      .eq("id", variantId)
      .eq("organization_id", context.organizationId);

    if (error) {
      throw new AppError("VALIDATION", mapDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.CATALOG_VARIANT_UPDATED,
      entityType: "item_variant",
      entityId: variantId,
      summary: "Variant updated",
      metadata: { itemId, name: input.name, status: input.status },
    });

    revalidateItemPaths(itemId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function createConversionAction(
  itemId: string,
  raw: unknown,
): Promise<CatalogActionResult<{ id: string }>> {
  try {
    const input = createConversionSchema.parse(raw);
    const context = await requirePermission("catalog.manage");
    const supabase = await createServerSupabaseClient();

    const { data: item } = await supabase
      .from("items")
      .select("id, base_unit_id")
      .eq("id", itemId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();
    if (!item) {
      throw new AppError("NOT_FOUND", "Item not found.", 404);
    }

    const { data, error } = await supabase
      .from("item_unit_conversions")
      .insert({
        organization_id: context.organizationId,
        item_id: itemId,
        from_unit_id: input.fromUnitId,
        to_unit_id: item.base_unit_id,
        multiplier: input.multiplier,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new AppError("VALIDATION", mapDbError(error?.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.CATALOG_CONVERSION_CREATED,
      entityType: "item_unit_conversion",
      entityId: data.id,
      summary: "Item unit conversion created",
      metadata: {
        itemId,
        fromUnitId: input.fromUnitId,
        toUnitId: item.base_unit_id,
        multiplier: input.multiplier,
      },
    });

    revalidateItemPaths(itemId);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteConversionAction(
  itemId: string,
  conversionId: string,
): Promise<CatalogActionResult> {
  try {
    const context = await requirePermission("catalog.manage");
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from("item_unit_conversions")
      .delete()
      .eq("id", conversionId)
      .eq("item_id", itemId)
      .eq("organization_id", context.organizationId);

    if (error) {
      throw new AppError("VALIDATION", mapDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.CATALOG_CONVERSION_DELETED,
      entityType: "item_unit_conversion",
      entityId: conversionId,
      summary: "Item unit conversion deleted",
      metadata: { itemId },
    });

    revalidateItemPaths(itemId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function createIdentifierAction(
  itemId: string,
  raw: unknown,
): Promise<CatalogActionResult<{ id: string }>> {
  try {
    const input = createIdentifierSchema.parse(raw);
    const context = await requirePermission("catalog.manage");
    const supabase = await createServerSupabaseClient();

    const { data: item } = await supabase
      .from("items")
      .select("id")
      .eq("id", itemId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();
    if (!item) {
      throw new AppError("NOT_FOUND", "Item not found.", 404);
    }

    const { data, error } = await supabase
      .from("item_identifiers")
      .insert({
        organization_id: context.organizationId,
        item_id: itemId,
        variant_id: input.variantId ?? null,
        identifier_type: input.identifierType,
        value_display: input.valueDisplay,
        is_primary: input.isPrimary,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new AppError("VALIDATION", mapDbError(error?.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.CATALOG_IDENTIFIER_CREATED,
      entityType: "item_identifier",
      entityId: data.id,
      summary: `Identifier created: ${input.identifierType}`,
      metadata: {
        itemId,
        variantId: input.variantId ?? null,
        identifierType: input.identifierType,
        isPrimary: input.isPrimary,
      },
    });

    revalidateItemPaths(itemId);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateIdentifierAction(
  itemId: string,
  identifierId: string,
  raw: unknown,
): Promise<CatalogActionResult> {
  try {
    const input = updateIdentifierSchema.parse(raw);
    const context = await requirePermission("catalog.manage");
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase
      .from("item_identifiers")
      .select("id")
      .eq("id", identifierId)
      .eq("item_id", itemId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();
    if (!existing) {
      throw new AppError("NOT_FOUND", "Identifier not found.", 404);
    }

    const { error } = await supabase
      .from("item_identifiers")
      .update({
        ...(input.identifierType ? { identifier_type: input.identifierType } : {}),
        ...(input.valueDisplay ? { value_display: input.valueDisplay } : {}),
        ...(input.isPrimary !== undefined ? { is_primary: input.isPrimary } : {}),
      })
      .eq("id", identifierId)
      .eq("organization_id", context.organizationId);

    if (error) {
      throw new AppError("VALIDATION", mapDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.CATALOG_IDENTIFIER_UPDATED,
      entityType: "item_identifier",
      entityId: identifierId,
      summary: "Identifier updated",
      metadata: { itemId, ...input },
    });

    revalidateItemPaths(itemId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteIdentifierAction(
  itemId: string,
  identifierId: string,
): Promise<CatalogActionResult> {
  try {
    const context = await requirePermission("catalog.manage");
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from("item_identifiers")
      .delete()
      .eq("id", identifierId)
      .eq("item_id", itemId)
      .eq("organization_id", context.organizationId);

    if (error) {
      throw new AppError("VALIDATION", mapDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.CATALOG_IDENTIFIER_DELETED,
      entityType: "item_identifier",
      entityId: identifierId,
      summary: "Identifier deleted",
      metadata: { itemId },
    });

    revalidateItemPaths(itemId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}
