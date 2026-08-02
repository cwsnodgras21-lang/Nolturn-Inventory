import "server-only";

import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapCategory, mapUnit } from "@/modules/catalog/mappers";
import type { CategoryTreeNode, CatalogStatus, ItemCategory, UnitOfMeasure } from "@/modules/catalog/types";

export async function listUnits(options?: {
  status?: CatalogStatus | "all";
  search?: string;
}): Promise<UnitOfMeasure[]> {
  const context = await requirePermission("catalog.read");
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("units_of_measure")
    .select(
      "id, organization_id, name, symbol, dimension, precision, unit_kind, status, is_system, created_at, updated_at",
    )
    .eq("organization_id", context.organizationId)
    .order("name", { ascending: true });

  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  if (options?.search?.trim()) {
    const term = `%${options.search.trim()}%`;
    query = query.or(`name.ilike.${term},symbol.ilike.${term}`);
  }

  const { data, error } = await query;
  if (error) {
    throw new AppError("INTERNAL", "Unable to load units.", 500);
  }

  return (data ?? []).map((row) => mapUnit(row as Parameters<typeof mapUnit>[0]));
}

export async function getUnit(unitId: string): Promise<UnitOfMeasure> {
  const context = await requirePermission("catalog.read");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("units_of_measure")
    .select(
      "id, organization_id, name, symbol, dimension, precision, unit_kind, status, is_system, created_at, updated_at",
    )
    .eq("organization_id", context.organizationId)
    .eq("id", unitId)
    .maybeSingle();

  if (error) {
    throw new AppError("INTERNAL", "Unable to load unit.", 500);
  }
  if (!data) {
    throw new AppError("NOT_FOUND", "Unit not found.", 404);
  }

  return mapUnit(data as Parameters<typeof mapUnit>[0]);
}

export async function listCategories(options?: {
  status?: CatalogStatus | "all";
}): Promise<ItemCategory[]> {
  const context = await requirePermission("catalog.read");
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("item_categories")
    .select(
      "id, organization_id, parent_id, name, description, status, sort_order, created_at, updated_at",
    )
    .eq("organization_id", context.organizationId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;
  if (error) {
    throw new AppError("INTERNAL", "Unable to load categories.", 500);
  }

  return (data ?? []).map((row) => mapCategory(row as Parameters<typeof mapCategory>[0]));
}

export async function getCategoryTree(options?: {
  status?: CatalogStatus | "all";
}): Promise<CategoryTreeNode[]> {
  const categories = await listCategories(options);
  const byParent = new Map<string | null, ItemCategory[]>();

  for (const category of categories) {
    const key = category.parentId;
    const list = byParent.get(key) ?? [];
    list.push(category);
    byParent.set(key, list);
  }

  function build(parentId: string | null): CategoryTreeNode[] {
    return (byParent.get(parentId) ?? []).map((category) => ({
      ...category,
      children: build(category.id),
    }));
  }

  return build(null);
}
