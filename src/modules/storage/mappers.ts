import type { StorageArea, StorageAreaType, StorageBin, StorageStatus } from "@/modules/storage/types";

type AreaRow = {
  id: string;
  organization_id: string;
  location_id: string;
  parent_id: string | null;
  name: string;
  code: string | null;
  area_type: string;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type BinRow = {
  id: string;
  organization_id: string;
  storage_area_id: string;
  name: string;
  code: string | null;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export function mapStorageArea(row: AreaRow): StorageArea {
  return {
    id: row.id,
    organizationId: row.organization_id,
    locationId: row.location_id,
    parentId: row.parent_id,
    name: row.name,
    code: row.code,
    areaType: row.area_type as StorageAreaType,
    status: row.status as StorageStatus,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapStorageBin(row: BinRow): StorageBin {
  return {
    id: row.id,
    organizationId: row.organization_id,
    storageAreaId: row.storage_area_id,
    name: row.name,
    code: row.code,
    status: row.status as StorageStatus,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapStorageDbError(message: string | undefined): string {
  const text = message ?? "";
  if (text.includes("storage_areas_location_code_uidx")) {
    return "A storage area with this code already exists in the location.";
  }
  if (text.includes("storage_bins_area_code_uidx")) {
    return "A bin with this code already exists in the storage area.";
  }
  if (text.includes("storage area cycle detected") || text.includes("cannot be its own parent")) {
    return "That parent would create a storage hierarchy cycle.";
  }
  if (text.includes("must belong to the same location")) {
    return "Parent storage area must belong to the same location.";
  }
  if (text.includes("must belong to the same organization") || text.includes("same organization")) {
    return "Related records must belong to the same organization.";
  }
  if (text.includes("organization_id is immutable") || text.includes("location_id is immutable")) {
    return "Organization and location cannot be changed.";
  }
  if (text.includes("storage_area_id is immutable")) {
    return "Bin storage area cannot be changed.";
  }
  return text || "Storage operation failed.";
}
