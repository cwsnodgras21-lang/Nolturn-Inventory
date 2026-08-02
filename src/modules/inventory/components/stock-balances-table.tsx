"use client";

import Link from "next/link";
import type { InventoryBalance } from "@/modules/inventory/types";

export function StockBalancesTable({ balances }: { balances: InventoryBalance[] }) {
  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="border-b border-border bg-surface text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="px-3 py-2 font-medium">Variant</th>
            <th className="px-3 py-2 font-medium">Lot</th>
            <th className="px-3 py-2 font-medium">Location</th>
            <th className="px-3 py-2 font-medium">Storage</th>
            <th className="px-3 py-2 font-medium">Bin</th>
            <th className="px-3 py-2 font-medium text-right">On hand</th>
          </tr>
        </thead>
        <tbody>
          {balances.map((balance) => (
            <tr key={balance.id} className="border-b border-border/70">
              <td className="px-3 py-2">
                <div className="font-medium">{balance.itemName ?? "Item"}</div>
                <div className="font-mono text-xs text-muted">{balance.itemSku}</div>
              </td>
              <td className="px-3 py-2 text-muted">{balance.variantName ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-xs text-muted">
                {balance.lotNumber ?? "—"}
                {balance.expirationDate ? (
                  <div className="text-[11px]">exp {balance.expirationDate}</div>
                ) : null}
              </td>
              <td className="px-3 py-2">{balance.locationName ?? "—"}</td>
              <td className="px-3 py-2">{balance.storageAreaName ?? "—"}</td>
              <td className="px-3 py-2 text-muted">{balance.binName ?? "—"}</td>
              <td className="px-3 py-2 text-right font-medium">
                {balance.quantityOnHand} {balance.baseUnitSymbol ?? ""}
              </td>
            </tr>
          ))}
          {balances.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-muted">
                No stock balances yet.{" "}
                <Link
                  href="/inventory/transactions/new"
                  className="text-accent underline-offset-2 hover:underline"
                >
                  Create an opening balance
                </Link>
                .
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
