export const UNIT_DIMENSIONS = ["count", "volume", "mass", "length"] as const;
export type UnitDimension = (typeof UNIT_DIMENSIONS)[number];

export const UNIT_KINDS = ["measurement", "packaging"] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];

export const CATALOG_STATUSES = ["active", "inactive"] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

export type UnitOfMeasure = {
  id: string;
  organizationId: string;
  name: string;
  symbol: string;
  dimension: UnitDimension;
  precision: number;
  unitKind: UnitKind;
  status: CatalogStatus;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ItemCategory = {
  id: string;
  organizationId: string;
  parentId: string | null;
  name: string;
  description: string | null;
  status: CatalogStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type CategoryTreeNode = ItemCategory & {
  children: CategoryTreeNode[];
};

export const IDENTIFIER_TYPES = [
  "barcode",
  "upc",
  "ean",
  "manufacturer_code",
  "internal_code",
] as const;
export type IdentifierType = (typeof IDENTIFIER_TYPES)[number];

export type TrackingMode = "quantity" | "lot";

export type CatalogItem = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  baseUnitId: string;
  defaultEntryUnitId: string;
  sku: string;
  status: CatalogStatus;
  requiresVariant: boolean;
  allowNegativeStock: boolean;
  trackingMode: TrackingMode;
  createdAt: string;
  updatedAt: string;
  categoryName?: string | null;
  baseUnitSymbol?: string | null;
  defaultEntryUnitSymbol?: string | null;
};

export type ItemVariant = {
  id: string;
  organizationId: string;
  itemId: string;
  name: string;
  sku: string | null;
  status: CatalogStatus;
  createdAt: string;
  updatedAt: string;
};

export type ItemUnitConversion = {
  id: string;
  organizationId: string;
  itemId: string;
  fromUnitId: string;
  toUnitId: string;
  multiplier: number;
  createdAt: string;
  updatedAt: string;
  fromUnitSymbol?: string | null;
  toUnitSymbol?: string | null;
};

export type ItemIdentifier = {
  id: string;
  organizationId: string;
  itemId: string;
  variantId: string | null;
  identifierType: IdentifierType;
  valueDisplay: string;
  valueNormalized: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};
