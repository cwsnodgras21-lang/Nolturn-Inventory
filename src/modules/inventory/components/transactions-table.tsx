"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { InventoryTransaction } from "@/modules/inventory/types";

export function TransactionsTable({
  transactions,
  canAdjust,
}: {
  transactions: InventoryTransaction[];
  canAdjust: boolean;
}) {
  return (
    <div className="space-y-4">
      {canAdjust ? (
        <div className="flex justify-end">
          <Button href="/inventory/transactions/new">New positive adjustment</Button>
        </div>
      ) : null}
      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border bg-surface text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Number</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {transactions.map((txn) => (
              <tr key={txn.id} className="border-b border-border/70">
                <td className="px-3 py-2 font-mono text-xs">{txn.transactionNumber}</td>
                <td className="px-3 py-2 capitalize">
                  {txn.transactionType.replaceAll("_", " ")}
                </td>
                <td className="px-3 py-2 capitalize">{txn.status}</td>
                <td className="px-3 py-2 text-muted">
                  {new Date(txn.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/inventory/transactions/${txn.id}`}
                    className="text-accent underline-offset-2 hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted">
                  No inventory transactions yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
