"use server";

import { revalidatePath } from "next/cache";
import { requireLocationAccess, requirePermission } from "@/lib/auth";
import { AppError, toSafeErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AUDIT_ACTIONS, writeAuditEvent } from "@/modules/audit";
import { mapStorageDbError } from "@/modules/storage/mappers";
import {
  changeStorageAreaStatusSchema,
  changeStorageBinStatusSchema,
  createStorageAreaSchema,
  createStorageBinSchema,
  reparentStorageAreaSchema,
  updateStorageAreaSchema,
  updateStorageBinSchema,
} from "@/modules/storage/schemas";

export type StorageActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

function fail(error: unknown): StorageActionResult<never> {
  if (error instanceof AppError) {
    return { ok: false, error: error.message, code: error.code };
  }
  return { ok: false, error: toSafeErrorMessage(error) };
}

function revalidateStorage() {
  revalidatePath("/administration/storage");
}

export async function createStorageAreaAction(
  raw: unknown,
): Promise<StorageActionResult<{ id: string }>> {
  try {
    const input = createStorageAreaSchema.parse(raw);
    const context = await requirePermission("inventory.storage.manage");
    await requireLocationAccess(input.locationId);
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("storage_areas")
      .insert({
        organization_id: context.organizationId,
        location_id: input.locationId,
        parent_id: input.parentId ?? null,
        name: input.name,
        code: input.code?.trim() ? input.code : null,
        area_type: input.areaType,
        status: input.status,
        sort_order: input.sortOrder,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new AppError("VALIDATION", mapStorageDbError(error?.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_STORAGE_AREA_CREATED,
      entityType: "storage_area",
      entityId: data.id,
      summary: `Storage area created: ${input.name}`,
      metadata: {
        locationId: input.locationId,
        parentId: input.parentId ?? null,
        areaType: input.areaType,
        code: input.code ?? null,
      },
    });

    revalidateStorage();
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateStorageAreaAction(
  areaId: string,
  raw: unknown,
): Promise<StorageActionResult> {
  try {
    const input = updateStorageAreaSchema.parse(raw);
    const context = await requirePermission("inventory.storage.manage");
    const supabase = await createServerSupabaseClient();

    const { data: existing, error: existingError } = await supabase
      .from("storage_areas")
      .select("id, location_id, status")
      .eq("id", areaId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (existingError || !existing) {
      throw new AppError("NOT_FOUND", "Storage area not found.", 404);
    }

    await requireLocationAccess(existing.location_id);

    const { error } = await supabase
      .from("storage_areas")
      .update({
        ...(input.name ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code?.trim() ? input.code : null } : {}),
        ...(input.areaType ? { area_type: input.areaType } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
      })
      .eq("id", areaId)
      .eq("organization_id", context.organizationId);

    if (error) {
      throw new AppError("VALIDATION", mapStorageDbError(error.message), 400);
    }

    const statusChanged = input.status && input.status !== existing.status;
    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: statusChanged
        ? AUDIT_ACTIONS.INVENTORY_STORAGE_AREA_STATUS_CHANGED
        : AUDIT_ACTIONS.INVENTORY_STORAGE_AREA_UPDATED,
      entityType: "storage_area",
      entityId: areaId,
      summary: statusChanged
        ? `Storage area status changed to ${input.status}`
        : "Storage area updated",
      metadata: {
        locationId: existing.location_id,
        previousStatus: existing.status,
        status: input.status ?? existing.status,
        name: input.name,
      },
    });

    revalidateStorage();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function reparentStorageAreaAction(
  areaId: string,
  raw: unknown,
): Promise<StorageActionResult> {
  try {
    const input = reparentStorageAreaSchema.parse(raw);
    const context = await requirePermission("inventory.storage.manage");
    const supabase = await createServerSupabaseClient();

    const { data: existing, error: existingError } = await supabase
      .from("storage_areas")
      .select("id, location_id, parent_id")
      .eq("id", areaId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (existingError || !existing) {
      throw new AppError("NOT_FOUND", "Storage area not found.", 404);
    }

    await requireLocationAccess(existing.location_id);

    const { error } = await supabase
      .from("storage_areas")
      .update({ parent_id: input.parentId })
      .eq("id", areaId)
      .eq("organization_id", context.organizationId);

    if (error) {
      throw new AppError("VALIDATION", mapStorageDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_STORAGE_AREA_REPARENTED,
      entityType: "storage_area",
      entityId: areaId,
      summary: "Storage area reparented",
      metadata: {
        locationId: existing.location_id,
        previousParentId: existing.parent_id,
        newParentId: input.parentId,
      },
    });

    revalidateStorage();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function changeStorageAreaStatusAction(
  areaId: string,
  raw: unknown,
): Promise<StorageActionResult> {
  const parsed = changeStorageAreaStatusSchema.parse(raw);
  return updateStorageAreaAction(areaId, { status: parsed.status });
}

export async function createStorageBinAction(
  raw: unknown,
): Promise<StorageActionResult<{ id: string }>> {
  try {
    const input = createStorageBinSchema.parse(raw);
    const context = await requirePermission("inventory.storage.manage");
    const supabase = await createServerSupabaseClient();

    const { data: area, error: areaError } = await supabase
      .from("storage_areas")
      .select("id, location_id")
      .eq("id", input.storageAreaId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (areaError || !area) {
      throw new AppError("NOT_FOUND", "Storage area not found.", 404);
    }

    await requireLocationAccess(area.location_id);

    const { data, error } = await supabase
      .from("storage_bins")
      .insert({
        organization_id: context.organizationId,
        storage_area_id: input.storageAreaId,
        name: input.name,
        code: input.code?.trim() ? input.code : null,
        status: input.status,
        sort_order: input.sortOrder,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new AppError("VALIDATION", mapStorageDbError(error?.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.INVENTORY_STORAGE_BIN_CREATED,
      entityType: "storage_bin",
      entityId: data.id,
      summary: `Storage bin created: ${input.name}`,
      metadata: {
        storageAreaId: input.storageAreaId,
        locationId: area.location_id,
        code: input.code ?? null,
      },
    });

    revalidateStorage();
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateStorageBinAction(
  binId: string,
  raw: unknown,
): Promise<StorageActionResult> {
  try {
    const input = updateStorageBinSchema.parse(raw);
    const context = await requirePermission("inventory.storage.manage");
    const supabase = await createServerSupabaseClient();

    const { data: existing, error: existingError } = await supabase
      .from("storage_bins")
      .select("id, storage_area_id, status")
      .eq("id", binId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (existingError || !existing) {
      throw new AppError("NOT_FOUND", "Storage bin not found.", 404);
    }

    const { data: area } = await supabase
      .from("storage_areas")
      .select("location_id")
      .eq("id", existing.storage_area_id)
      .maybeSingle();

    if (!area) {
      throw new AppError("NOT_FOUND", "Storage area not found.", 404);
    }

    await requireLocationAccess(area.location_id);

    const { error } = await supabase
      .from("storage_bins")
      .update({
        ...(input.name ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code?.trim() ? input.code : null } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
      })
      .eq("id", binId)
      .eq("organization_id", context.organizationId);

    if (error) {
      throw new AppError("VALIDATION", mapStorageDbError(error.message), 400);
    }

    const statusChanged = input.status && input.status !== existing.status;
    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: statusChanged
        ? AUDIT_ACTIONS.INVENTORY_STORAGE_BIN_STATUS_CHANGED
        : AUDIT_ACTIONS.INVENTORY_STORAGE_BIN_UPDATED,
      entityType: "storage_bin",
      entityId: binId,
      summary: statusChanged
        ? `Storage bin status changed to ${input.status}`
        : "Storage bin updated",
      metadata: {
        storageAreaId: existing.storage_area_id,
        locationId: area.location_id,
        previousStatus: existing.status,
        status: input.status ?? existing.status,
      },
    });

    revalidateStorage();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function changeStorageBinStatusAction(
  binId: string,
  raw: unknown,
): Promise<StorageActionResult> {
  const parsed = changeStorageBinStatusSchema.parse(raw);
  return updateStorageBinAction(binId, { status: parsed.status });
}
