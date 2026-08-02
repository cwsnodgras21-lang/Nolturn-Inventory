"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { AppError, toSafeErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AUDIT_ACTIONS, writeAuditEvent } from "@/modules/audit";
import { mapDbError } from "@/modules/catalog/mappers";
import {
  changeCategoryStatusSchema,
  changeUnitStatusSchema,
  createCategorySchema,
  createUnitSchema,
  reparentCategorySchema,
  updateCategorySchema,
  updateUnitSchema,
} from "@/modules/catalog/schemas";

export type CatalogActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

function fail(error: unknown): CatalogActionResult<never> {
  if (error instanceof AppError) {
    return { ok: false, error: error.message, code: error.code };
  }
  return { ok: false, error: toSafeErrorMessage(error) };
}

export async function createUnitAction(raw: unknown): Promise<CatalogActionResult<{ id: string }>> {
  try {
    const input = createUnitSchema.parse(raw);
    const context = await requirePermission("catalog.manage");
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("units_of_measure")
      .insert({
        organization_id: context.organizationId,
        name: input.name,
        symbol: input.symbol,
        dimension: input.dimension,
        precision: input.precision,
        unit_kind: input.unitKind,
        status: input.status,
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
      action: AUDIT_ACTIONS.CATALOG_UNIT_CREATED,
      entityType: "unit_of_measure",
      entityId: data.id,
      summary: `Unit created: ${input.name}`,
      metadata: {
        name: input.name,
        symbol: input.symbol,
        dimension: input.dimension,
        unitKind: input.unitKind,
      },
    });

    revalidatePath("/administration/catalog/units");
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateUnitAction(
  unitId: string,
  raw: unknown,
): Promise<CatalogActionResult> {
  try {
    const input = updateUnitSchema.parse(raw);
    const context = await requirePermission("catalog.manage");
    const supabase = await createServerSupabaseClient();

    const { data: existing, error: existingError } = await supabase
      .from("units_of_measure")
      .select("id, status")
      .eq("id", unitId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (existingError || !existing) {
      throw new AppError("NOT_FOUND", "Unit not found.", 404);
    }

    const { error } = await supabase
      .from("units_of_measure")
      .update({
        ...(input.name ? { name: input.name } : {}),
        ...(input.symbol ? { symbol: input.symbol } : {}),
        ...(input.dimension ? { dimension: input.dimension } : {}),
        ...(input.precision !== undefined ? { precision: input.precision } : {}),
        ...(input.unitKind ? { unit_kind: input.unitKind } : {}),
        ...(input.status ? { status: input.status } : {}),
      })
      .eq("id", unitId)
      .eq("organization_id", context.organizationId);

    if (error) {
      throw new AppError("VALIDATION", mapDbError(error.message), 400);
    }

    const statusChanged = input.status && input.status !== existing.status;
    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: statusChanged
        ? AUDIT_ACTIONS.CATALOG_UNIT_STATUS_CHANGED
        : AUDIT_ACTIONS.CATALOG_UNIT_UPDATED,
      entityType: "unit_of_measure",
      entityId: unitId,
      summary: statusChanged
        ? `Unit status changed to ${input.status}`
        : "Unit updated",
      metadata: {
        previousStatus: existing.status,
        status: input.status ?? existing.status,
        name: input.name,
        symbol: input.symbol,
      },
    });

    revalidatePath("/administration/catalog/units");
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function changeUnitStatusAction(
  unitId: string,
  raw: unknown,
): Promise<CatalogActionResult> {
  const parsed = changeUnitStatusSchema.parse(raw);
  return updateUnitAction(unitId, { status: parsed.status });
}

export async function createCategoryAction(
  raw: unknown,
): Promise<CatalogActionResult<{ id: string }>> {
  try {
    const input = createCategorySchema.parse(raw);
    const context = await requirePermission("catalog.manage");
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("item_categories")
      .insert({
        organization_id: context.organizationId,
        name: input.name,
        description: input.description ?? null,
        parent_id: input.parentId ?? null,
        sort_order: input.sortOrder,
        status: input.status,
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
      action: AUDIT_ACTIONS.CATALOG_CATEGORY_CREATED,
      entityType: "item_category",
      entityId: data.id,
      summary: `Category created: ${input.name}`,
      metadata: {
        name: input.name,
        parentId: input.parentId ?? null,
      },
    });

    revalidatePath("/administration/catalog/categories");
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateCategoryAction(
  categoryId: string,
  raw: unknown,
): Promise<CatalogActionResult> {
  try {
    const input = updateCategorySchema.parse(raw);
    const context = await requirePermission("catalog.manage");
    const supabase = await createServerSupabaseClient();

    const { data: existing, error: existingError } = await supabase
      .from("item_categories")
      .select("id, status, parent_id")
      .eq("id", categoryId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (existingError || !existing) {
      throw new AppError("NOT_FOUND", "Category not found.", 404);
    }

    const { error } = await supabase
      .from("item_categories")
      .update({
        ...(input.name ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
        ...(input.status ? { status: input.status } : {}),
      })
      .eq("id", categoryId)
      .eq("organization_id", context.organizationId);

    if (error) {
      throw new AppError("VALIDATION", mapDbError(error.message), 400);
    }

    const statusChanged = input.status && input.status !== existing.status;
    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: statusChanged
        ? AUDIT_ACTIONS.CATALOG_CATEGORY_STATUS_CHANGED
        : AUDIT_ACTIONS.CATALOG_CATEGORY_UPDATED,
      entityType: "item_category",
      entityId: categoryId,
      summary: statusChanged
        ? `Category status changed to ${input.status}`
        : "Category updated",
      metadata: {
        previousStatus: existing.status,
        status: input.status ?? existing.status,
        name: input.name,
      },
    });

    revalidatePath("/administration/catalog/categories");
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function reparentCategoryAction(
  categoryId: string,
  raw: unknown,
): Promise<CatalogActionResult> {
  try {
    const input = reparentCategorySchema.parse(raw);
    const context = await requirePermission("catalog.manage");
    const supabase = await createServerSupabaseClient();

    const { data: existing, error: existingError } = await supabase
      .from("item_categories")
      .select("id, parent_id")
      .eq("id", categoryId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (existingError || !existing) {
      throw new AppError("NOT_FOUND", "Category not found.", 404);
    }

    const { error } = await supabase
      .from("item_categories")
      .update({ parent_id: input.parentId })
      .eq("id", categoryId)
      .eq("organization_id", context.organizationId);

    if (error) {
      throw new AppError("VALIDATION", mapDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.CATALOG_CATEGORY_REPARENTED,
      entityType: "item_category",
      entityId: categoryId,
      summary: "Category reparented",
      metadata: {
        previousParentId: existing.parent_id,
        newParentId: input.parentId,
      },
    });

    revalidatePath("/administration/catalog/categories");
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function changeCategoryStatusAction(
  categoryId: string,
  raw: unknown,
): Promise<CatalogActionResult> {
  const parsed = changeCategoryStatusSchema.parse(raw);
  return updateCategoryAction(categoryId, { status: parsed.status });
}
