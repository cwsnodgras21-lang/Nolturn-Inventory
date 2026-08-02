import "server-only";

import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  mapConversion,
  mapIdentifier,
  mapItem,
  mapVariant,
} from "@/modules/catalog/mappers";
import type {
  CatalogItem,
  CatalogStatus,
  ItemIdentifier,
  ItemUnitConversion,
  ItemVariant,
} from "@/modules/catalog/types";

export async function listItems(options?: {
  status?: CatalogStatus | "all";
  categoryId?: string | null;
  search?: string;
}): Promise<CatalogItem[]> {
  const context = await requirePermission("catalog.read");
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("items")
    .select(
      "id, organization_id, name, description, category_id, base_unit_id, default_entry_unit_id, sku, status, requires_variant, allow_negative_stock, tracking_mode, created_at, updated_at, item_categories(name), base_unit:units_of_measure!items_base_unit_id_fkey(symbol), entry_unit:units_of_measure!items_default_entry_unit_id_fkey(symbol)",
    )
    .eq("organization_id", context.organizationId)
    .order("name", { ascending: true });

  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }
  if (options?.categoryId) {
    query = query.eq("category_id", options.categoryId);
  }
  if (options?.search?.trim()) {
    const term = options.search.trim();
    query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw new AppError("INTERNAL", "Unable to load items.", 500);
  }

  return (data ?? []).map((row) => mapItem(row as unknown as Parameters<typeof mapItem>[0]));
}

export async function getItem(itemId: string): Promise<CatalogItem> {
  const context = await requirePermission("catalog.read");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("items")
    .select(
      "id, organization_id, name, description, category_id, base_unit_id, default_entry_unit_id, sku, status, requires_variant, allow_negative_stock, tracking_mode, created_at, updated_at, item_categories(name), base_unit:units_of_measure!items_base_unit_id_fkey(symbol), entry_unit:units_of_measure!items_default_entry_unit_id_fkey(symbol)",
    )
    .eq("organization_id", context.organizationId)
    .eq("id", itemId)
    .maybeSingle();

  if (error) {
    throw new AppError("INTERNAL", "Unable to load item.", 500);
  }
  if (!data) {
    throw new AppError("NOT_FOUND", "Item not found.", 404);
  }

  return mapItem(data as unknown as Parameters<typeof mapItem>[0]);
}

export async function listItemVariants(itemId: string): Promise<ItemVariant[]> {
  const context = await requirePermission("catalog.read");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("item_variants")
    .select("id, organization_id, item_id, name, sku, status, created_at, updated_at")
    .eq("organization_id", context.organizationId)
    .eq("item_id", itemId)
    .order("name", { ascending: true });

  if (error) {
    throw new AppError("INTERNAL", "Unable to load variants.", 500);
  }

  return (data ?? []).map((row) => mapVariant(row));
}

export async function listItemConversions(itemId: string): Promise<ItemUnitConversion[]> {
  const context = await requirePermission("catalog.read");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("item_unit_conversions")
    .select(
      "id, organization_id, item_id, from_unit_id, to_unit_id, multiplier, created_at, updated_at, from_unit:units_of_measure!item_unit_conversions_from_unit_id_fkey(symbol), to_unit:units_of_measure!item_unit_conversions_to_unit_id_fkey(symbol)",
    )
    .eq("organization_id", context.organizationId)
    .eq("item_id", itemId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new AppError("INTERNAL", "Unable to load conversions.", 500);
  }

  return (data ?? []).map((row) =>
    mapConversion(row as unknown as Parameters<typeof mapConversion>[0]),
  );
}

export async function listItemIdentifiers(itemId: string): Promise<ItemIdentifier[]> {
  const context = await requirePermission("catalog.read");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("item_identifiers")
    .select(
      "id, organization_id, item_id, variant_id, identifier_type, value_display, value_normalized, is_primary, created_at, updated_at",
    )
    .eq("organization_id", context.organizationId)
    .eq("item_id", itemId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new AppError("INTERNAL", "Unable to load identifiers.", 500);
  }

  return (data ?? []).map((row) => mapIdentifier(row));
}

export async function listAllVariants(): Promise<ItemVariant[]> {
  const context = await requirePermission("catalog.read");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("item_variants")
    .select("id, organization_id, item_id, name, sku, status, created_at, updated_at")
    .eq("organization_id", context.organizationId)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) {
    throw new AppError("INTERNAL", "Unable to load variants.", 500);
  }

  return (data ?? []).map((row) => mapVariant(row));
}
