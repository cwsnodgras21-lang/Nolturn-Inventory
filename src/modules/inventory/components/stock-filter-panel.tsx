"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { InventoryBalance } from "@/modules/inventory/types";

type Option = { id: string; name: string };

export function StockFilterPanel({
  balances,
  locations,
  areas,
}: {
  balances: InventoryBalance[];
  locations: Option[];
  areas: Array<Option & { locationId: string }>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [locationId, setLocationId] = useState(params.get("locationId") ?? "");
  const [storageAreaId, setStorageAreaId] = useState(params.get("storageAreaId") ?? "");

  const filteredAreas = useMemo(
    () => (locationId ? areas.filter((a) => a.locationId === locationId) : areas),
    [areas, locationId],
  );

  const visible = useMemo(() => {
    return balances.filter((b) => {
      if (locationId && b.locationId !== locationId) return false;
      if (storageAreaId && b.storageAreaId !== storageAreaId) return false;
      if (!search.trim()) return true;
      const term = search.trim().toLowerCase();
      return (
        b.itemName?.toLowerCase().includes(term) ||
        b.itemSku?.toLowerCase().includes(term) ||
        b.variantName?.toLowerCase().includes(term) ||
        b.binName?.toLowerCase().includes(term)
      );
    });
  }, [balances, locationId, storageAreaId, search]);

  function applyFilters() {
    const next = new URLSearchParams();
    if (search.trim()) next.set("search", search.trim());
    if (locationId) next.set("locationId", locationId);
    if (storageAreaId) next.set("storageAreaId", storageAreaId);
    router.push(`/inventory/stock?${next.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search item, SKU, variant, bin"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <select
          value={locationId}
          onChange={(e) => {
            setLocationId(e.target.value);
            setStorageAreaId("");
          }}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">All locations</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
        <select
          value={storageAreaId}
          onChange={(e) => setStorageAreaId(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">All areas</option>
          {filteredAreas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={applyFilters}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
        >
          Apply
        </button>
      </div>

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-surface text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Variant</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Storage</th>
              <th className="px-3 py-2 font-medium">Bin</th>
              <th className="px-3 py-2 font-medium text-right">On hand</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((balance) => (
              <tr key={balance.id} className="border-b border-border/70">
                <td className="px-3 py-2">
                  <div className="font-medium">{balance.itemName ?? "Item"}</div>
                  <div className="font-mono text-xs text-muted">{balance.itemSku}</div>
                </td>
                <td className="px-3 py-2 text-muted">{balance.variantName ?? "—"}</td>
                <td className="px-3 py-2">{balance.locationName ?? "—"}</td>
                <td className="px-3 py-2">{balance.storageAreaName ?? "—"}</td>
                <td className="px-3 py-2 text-muted">{balance.binName ?? "—"}</td>
                <td className="px-3 py-2 text-right font-medium">
                  {balance.quantityOnHand} {balance.baseUnitSymbol ?? ""}
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted">
                  No balances match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
