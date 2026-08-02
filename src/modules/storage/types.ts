export const STORAGE_AREA_TYPES = [
  "room",
  "cabinet",
  "shelf",
  "refrigerator",
  "freezer",
  "closet",
  "warehouse",
  "other",
] as const;

export type StorageAreaType = (typeof STORAGE_AREA_TYPES)[number];

export const STORAGE_STATUSES = ["active", "inactive"] as const;
export type StorageStatus = (typeof STORAGE_STATUSES)[number];

export type StorageArea = {
  id: string;
  organizationId: string;
  locationId: string;
  parentId: string | null;
  name: string;
  code: string | null;
  areaType: StorageAreaType;
  status: StorageStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type StorageAreaTreeNode = StorageArea & {
  children: StorageAreaTreeNode[];
};

export type StorageBin = {
  id: string;
  organizationId: string;
  storageAreaId: string;
  name: string;
  code: string | null;
  status: StorageStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};
