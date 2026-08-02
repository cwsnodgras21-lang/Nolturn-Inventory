"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CatalogItem, ItemCategory } from "@/modules/catalog/types";

export function ItemsListPanel({
  items,
  categories,
  canManage,
  initialSearch = "",
  initialStatus = "all",
  initialCategoryId = "",
}: {
  items: CatalogItem[];
  categories: ItemCategory[];
  canManage: boolean;
  initialSearch?: string;
  initialStatus?: "all" | "active" | "inactive";
  initialCategoryId?: string;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(initialStatus);
  const [categoryId, setCategoryId] = useState(initialCategoryId);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (categoryId && item.categoryId !== categoryId) return false;
      if (!search.trim()) return true;
      const term = search.trim().toLowerCase();
      return (
        item.name.toLowerCase().includes(term) ||
        item.sku.toLowerCase().includes(term) ||
        (item.categoryName?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [items, search, statusFilter, categoryId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or SKU"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        {canManage ? (
          <Button href="/administration/catalog/items/new">New item</Button>
        ) : null}
      </div>

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border bg-surface text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Base unit</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id} className="border-b border-border/70">
                <td className="px-3 py-2">
                  <Link
                    href={`/administration/catalog/items/${item.id}`}
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {item.name}
                  </Link>
                  {item.requiresVariant ? (
                    <span className="ml-2 text-xs text-muted">variants required</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{item.sku}</td>
                <td className="px-3 py-2 text-muted">{item.categoryName ?? "—"}</td>
                <td className="px-3 py-2">{item.baseUnitSymbol ?? "—"}</td>
                <td className="px-3 py-2 capitalize">{item.status}</td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/administration/catalog/items/${item.id}`}
                    className="text-sm text-accent underline-offset-2 hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted">
                  No items match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
