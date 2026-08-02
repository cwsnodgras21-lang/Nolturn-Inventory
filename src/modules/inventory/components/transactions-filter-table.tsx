"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  INVENTORY_TRANSACTION_TYPES,
  type InventoryTransaction,
  type InventoryTransactionStatus,
  type InventoryTransactionType,
} from "@/modules/inventory/types";

export function TransactionsFilterTable({
  transactions,
  canAdjust,
  canReceive,
  canConsume,
  canTransfer,
  status,
  type,
}: {
  transactions: InventoryTransaction[];
  canAdjust: boolean;
  canReceive: boolean;
  canConsume: boolean;
  canTransfer: boolean;
  status: InventoryTransactionStatus | "all";
  type: InventoryTransactionType | "all";
}) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {canReceive ? <Button href="/inventory/receive">Receive</Button> : null}
        {canConsume ? (
          <Button href="/inventory/consume" variant="secondary">
            Consume
          </Button>
        ) : null}
        {canTransfer ? (
          <Button href="/inventory/transfer" variant="secondary">
            Transfer
          </Button>
        ) : null}
        {canAdjust ? (
          <Button href="/inventory/adjust" variant="secondary">
            Adjust
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={type}
          onChange={(e) => {
            const next = new URLSearchParams();
            if (e.target.value !== "all") next.set("type", e.target.value);
            if (status !== "all") next.set("status", status);
            router.push(`/inventory/transactions?${next.toString()}`);
          }}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All types</option>
          {INVENTORY_TRANSACTION_TYPES.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            const next = new URLSearchParams();
            if (type !== "all") next.set("type", type);
            if (e.target.value !== "all") next.set("status", e.target.value);
            router.push(`/inventory/transactions?${next.toString()}`);
          }}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

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
                  No inventory transactions match the filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
