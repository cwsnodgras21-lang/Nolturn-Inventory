"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createRestockDraftPurchaseOrdersAction } from "@/modules/reorder/commands";
import type { RestockSuggestion } from "@/modules/reorder/types";

export function RestockFilterBar({
  stockState,
}: {
  stockState: "all" | "low" | "out";
}) {
  const router = useRouter();
  return (
    <form
      className="flex flex-wrap gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const next = String(data.get("stockState") || "all");
        const params = new URLSearchParams();
        if (next !== "all") params.set("state", next);
        router.push(`/inventory/restock${params.size ? `?${params}` : ""}`);
      }}
    >
      <label className="space-y-1 text-sm">
        <span className="text-muted">Stock state</span>
        <select
          name="stockState"
          defaultValue={stockState}
          className="block min-w-[10rem] rounded-md border border-border bg-background px-3 py-2"
        >
          <option value="all">Low and out of stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
      </label>
      <div className="flex items-end">
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </div>
    </form>
  );
}

export function RestockPlanningWorkspace({
  suggestions,
  suppliers,
  canCreateDraftOrders,
}: {
  suggestions: RestockSuggestion[];
  suppliers: Array<{ id: string; name: string }>;
  canCreateDraftOrders: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [supplierOverrides, setSupplierOverrides] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [requestKey] = useState(() => crypto.randomUUID());

  const byKey = useMemo(
    () => new Map(suggestions.map((suggestion) => [suggestion.key, suggestion])),
    [suggestions],
  );

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function createDrafts() {
    setMessage(null);
    const selections = [...selected]
      .map((key) => byKey.get(key))
      .filter((row): row is RestockSuggestion => Boolean(row));

    const missingUnit = selections.find((row) => !row.defaultEntryUnitId);
    if (missingUnit) {
      setMessage(`Missing purchase unit for ${missingUnit.itemName ?? "item"}.`);
      return;
    }

    const payload = selections.map((row) => {
      const supplierId = supplierOverrides[row.key] || row.preferredSupplierId;
      return {
        itemId: row.itemId,
        variantId: row.variantId,
        locationId: row.locationId,
        supplierId: supplierId as string,
        suggestedQuantity: row.suggestedQuantity,
        purchaseUnitId: row.defaultEntryUnitId as string,
        ruleId: row.ruleId,
      };
    });

    const withoutSupplier = payload.find((row) => !row.supplierId);
    if (withoutSupplier) {
      setMessage("Each selected line needs a preferred or override supplier.");
      return;
    }

    startTransition(async () => {
      const result = await createRestockDraftPurchaseOrdersAction({
        requestKey,
        selections: payload,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      const count = result.data.purchaseOrderIds.length;
      setMessage(
        result.data.reused
          ? `Request already processed — ${count} draft PO(s) linked.`
          : `Created ${count} draft purchase order(s).`,
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-border bg-surface text-muted">
            <tr>
              <th className="px-3 py-2 font-medium" />
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-3 py-2 font-medium text-right">Available</th>
              <th className="px-3 py-2 font-medium text-right">Min</th>
              <th className="px-3 py-2 font-medium text-right">Target</th>
              <th className="px-3 py-2 font-medium text-right">Suggested</th>
              <th className="px-3 py-2 font-medium">Supplier</th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((row) => {
              const checked = selected.has(row.key);
              const supplierValue = supplierOverrides[row.key] || row.preferredSupplierId || "";
              return (
                <tr key={row.key} className="border-b border-border/70">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!canCreateDraftOrders}
                      onChange={() => toggle(row.key)}
                      aria-label={`Select ${row.itemName ?? "item"}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{row.itemName ?? "Item"}</div>
                    <div className="font-mono text-xs text-muted">
                      {row.itemSku}
                      {row.variantName ? ` · ${row.variantName}` : ""}
                      {row.ruleIsLocationOverride ? " · location rule" : " · default rule"}
                    </div>
                  </td>
                  <td className="px-3 py-2">{row.locationName ?? "—"}</td>
                  <td className="px-3 py-2 capitalize">
                    {row.stockState === "out" ? "Out of stock" : "Low stock"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {row.availableQuantity}
                    {row.baseUnitSymbol ? (
                      <span className="ml-1 text-xs text-muted">{row.baseUnitSymbol}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right">{row.minimumQuantity}</td>
                  <td className="px-3 py-2 text-right">{row.targetQuantity}</td>
                  <td className="px-3 py-2 text-right font-medium">{row.suggestedQuantity}</td>
                  <td className="px-3 py-2">
                    {canCreateDraftOrders ? (
                      <select
                        className="w-full min-w-[10rem] rounded-md border border-border bg-background px-2 py-1"
                        value={supplierValue}
                        disabled={!checked}
                        onChange={(event) =>
                          setSupplierOverrides((current) => ({
                            ...current,
                            [row.key]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select supplier</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      row.preferredSupplierName ?? "—"
                    )}
                  </td>
                </tr>
              );
            })}
            {suggestions.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted">
                  No restock suggestions for this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {canCreateDraftOrders ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={pending || selected.size === 0}
            onClick={createDrafts}
          >
            Create draft purchase orders
          </Button>
          <p className="text-sm text-muted">
            Groups by supplier and ship-to location. Does not submit orders.{" "}
            <Link href="/purchasing/orders" className="text-accent underline-offset-2 hover:underline">
              View orders
            </Link>
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Draft PO creation requires reorder manage and purchasing manage permissions.
        </p>
      )}
    </div>
  );
}
