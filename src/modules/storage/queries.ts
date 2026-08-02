import "server-only";

import { requireLocationAccess, requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapStorageArea, mapStorageBin } from "@/modules/storage/mappers";
import type {
  StorageArea,
  StorageAreaTreeNode,
  StorageBin,
  StorageStatus,
} from "@/modules/storage/types";

export async function listStorageAreasForLocation(
  locationId: string,
  options?: { status?: StorageStatus | "all"; search?: string },
): Promise<StorageArea[]> {
  await requirePermission("inventory.storage.read");
  await requireLocationAccess(locationId);
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("storage_areas")
    .select(
      "id, organization_id, location_id, parent_id, name, code, area_type, status, sort_order, created_at, updated_at",
    )
    .eq("location_id", locationId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;
  if (error) {
    throw new AppError("INTERNAL", "Unable to load storage areas.", 500);
  }

  let areas = (data ?? []).map((row) => mapStorageArea(row));
  if (options?.search?.trim()) {
    const term = options.search.trim().toLowerCase();
    areas = areas.filter(
      (area) =>
        area.name.toLowerCase().includes(term) ||
        (area.code?.toLowerCase().includes(term) ?? false),
    );
  }
  return areas;
}

export async function getStorageAreaTree(
  locationId: string,
  options?: { status?: StorageStatus | "all"; search?: string },
): Promise<StorageAreaTreeNode[]> {
  const areas = await listStorageAreasForLocation(locationId, options);
  const byId = new Map<string, StorageAreaTreeNode>();
  for (const area of areas) {
    byId.set(area.id, { ...area, children: [] });
  }

  const roots: StorageAreaTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export async function getStorageArea(areaId: string): Promise<StorageArea> {
  const context = await requirePermission("inventory.storage.read");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("storage_areas")
    .select(
      "id, organization_id, location_id, parent_id, name, code, area_type, status, sort_order, created_at, updated_at",
    )
    .eq("organization_id", context.organizationId)
    .eq("id", areaId)
    .maybeSingle();

  if (error) {
    throw new AppError("INTERNAL", "Unable to load storage area.", 500);
  }
  if (!data) {
    throw new AppError("NOT_FOUND", "Storage area not found.", 404);
  }

  await requireLocationAccess(data.location_id);
  return mapStorageArea(data);
}

export async function listStorageBinsForArea(storageAreaId: string): Promise<StorageBin[]> {
  await requirePermission("inventory.storage.read");
  const area = await getStorageArea(storageAreaId);
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("storage_bins")
    .select(
      "id, organization_id, storage_area_id, name, code, status, sort_order, created_at, updated_at",
    )
    .eq("storage_area_id", area.id)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new AppError("INTERNAL", "Unable to load storage bins.", 500);
  }

  return (data ?? []).map((row) => mapStorageBin(row));
}

export async function listStorageBinsForLocation(locationId: string): Promise<StorageBin[]> {
  const areas = await listStorageAreasForLocation(locationId, { status: "all" });
  if (areas.length === 0) return [];

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("storage_bins")
    .select(
      "id, organization_id, storage_area_id, name, code, status, sort_order, created_at, updated_at",
    )
    .in(
      "storage_area_id",
      areas.map((a) => a.id),
    )
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new AppError("INTERNAL", "Unable to load storage bins.", 500);
  }

  return (data ?? []).map((row) => mapStorageBin(row));
}
