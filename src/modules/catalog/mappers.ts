import type {
  CatalogItem,
  IdentifierType,
  ItemCategory,
  ItemIdentifier,
  ItemUnitConversion,
  ItemVariant,
  UnitOfMeasure,
} from "@/modules/catalog/types";

type UnitRow = {
  id: string;
  organization_id: string;
  name: string;
  symbol: string;
  dimension: string;
  precision: number;
  unit_kind: string;
  status: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

type CategoryRow = {
  id: string;
  organization_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  base_unit_id: string;
  default_entry_unit_id: string;
  sku: string;
  status: string;
  requires_variant: boolean;
  allow_negative_stock: boolean;
  tracking_mode?: string | null;
  created_at: string;
  updated_at: string;
  item_categories?: { name: string } | { name: string }[] | null;
  base_unit?: { symbol: string } | { symbol: string }[] | null;
  entry_unit?: { symbol: string } | { symbol: string }[] | null;
};

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function mapUnit(row: UnitRow): UnitOfMeasure {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    symbol: row.symbol,
    dimension: row.dimension as UnitOfMeasure["dimension"],
    precision: row.precision,
    unitKind: row.unit_kind as UnitOfMeasure["unitKind"],
    status: row.status as UnitOfMeasure["status"],
    isSystem: row.is_system,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCategory(row: CategoryRow): ItemCategory {
  return {
    id: row.id,
    organizationId: row.organization_id,
    parentId: row.parent_id,
    name: row.name,
    description: row.description,
    status: row.status as ItemCategory["status"],
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapItem(row: ItemRow): CatalogItem {
  const category = asSingle(row.item_categories);
  const baseUnit = asSingle(row.base_unit);
  const entryUnit = asSingle(row.entry_unit);
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    categoryId: row.category_id,
    baseUnitId: row.base_unit_id,
    defaultEntryUnitId: row.default_entry_unit_id,
    sku: row.sku,
    status: row.status as CatalogItem["status"],
    requiresVariant: row.requires_variant,
    allowNegativeStock: row.allow_negative_stock,
    trackingMode: (row.tracking_mode === "lot" ? "lot" : "quantity") as CatalogItem["trackingMode"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    categoryName: category?.name ?? null,
    baseUnitSymbol: baseUnit?.symbol ?? null,
    defaultEntryUnitSymbol: entryUnit?.symbol ?? null,
  };
}

export function mapVariant(row: {
  id: string;
  organization_id: string;
  item_id: string;
  name: string;
  sku: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}): ItemVariant {
  return {
    id: row.id,
    organizationId: row.organization_id,
    itemId: row.item_id,
    name: row.name,
    sku: row.sku,
    status: row.status as ItemVariant["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapConversion(row: {
  id: string;
  organization_id: string;
  item_id: string;
  from_unit_id: string;
  to_unit_id: string;
  multiplier: number | string;
  created_at: string;
  updated_at: string;
  from_unit?: { symbol: string } | { symbol: string }[] | null;
  to_unit?: { symbol: string } | { symbol: string }[] | null;
}): ItemUnitConversion {
  return {
    id: row.id,
    organizationId: row.organization_id,
    itemId: row.item_id,
    fromUnitId: row.from_unit_id,
    toUnitId: row.to_unit_id,
    multiplier: Number(row.multiplier),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fromUnitSymbol: asSingle(row.from_unit)?.symbol ?? null,
    toUnitSymbol: asSingle(row.to_unit)?.symbol ?? null,
  };
}

export function mapIdentifier(row: {
  id: string;
  organization_id: string;
  item_id: string;
  variant_id: string | null;
  identifier_type: string;
  value_display: string;
  value_normalized: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}): ItemIdentifier {
  return {
    id: row.id,
    organizationId: row.organization_id,
    itemId: row.item_id,
    variantId: row.variant_id,
    identifierType: row.identifier_type as IdentifierType,
    valueDisplay: row.value_display,
    valueNormalized: row.value_normalized,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDbError(message: string | undefined): string {
  const text = message ?? "";
  if (text.includes("units_of_measure_org_name_normalized_uidx")) {
    return "A unit with this name already exists in the organization.";
  }
  if (text.includes("units_of_measure_org_symbol_normalized_uidx")) {
    return "A unit with this symbol already exists in the organization.";
  }
  if (text.includes("item_categories_sibling_name_uidx")) {
    return "A category with this name already exists among siblings.";
  }
  if (text.includes("items_org_sku_normalized_uidx")) {
    return "An item with this SKU already exists in the organization.";
  }
  if (text.includes("item_variants_item_name_uidx")) {
    return "A variant with this name already exists on the item.";
  }
  if (text.includes("item_variants_org_sku_uidx")) {
    return "A variant with this SKU already exists in the organization.";
  }
  if (text.includes("item_identifiers_org_value_uidx")) {
    return "This identifier value already exists in the organization.";
  }
  if (text.includes("item_identifiers_primary_")) {
    return "A primary identifier already exists for this item or variant.";
  }
  if (text.includes("item_unit_conversions_pair_unique") || text.includes("item_unit_conversions_no_self")) {
    return "Invalid or duplicate unit conversion.";
  }
  if (text.includes("must equal the item base unit")) {
    return "Conversions must target the item base unit.";
  }
  if (text.includes("category cycle detected") || text.includes("cannot be its own parent")) {
    return "That parent would create a category cycle.";
  }
  if (text.includes("must belong to the same organization") || text.includes("same organization")) {
    return "Related records must belong to the same organization.";
  }
  if (text.includes("variant must belong to the selected item")) {
    return "Identifier variant must belong to the selected item.";
  }
  if (text.includes("organization_id is immutable")) {
    return "Organization cannot be changed.";
  }
  if (text.includes("precision")) {
    return "Precision must be between 0 and 6.";
  }
  if (text.includes("multiplier")) {
    return "Conversion multiplier must be greater than zero.";
  }
  return text || "Catalog operation failed.";
}
