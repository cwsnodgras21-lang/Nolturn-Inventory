import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { TransactionsFilterTable } from "@/modules/inventory/components/transactions-filter-table";
import { listTransactions } from "@/modules/inventory/queries";
import type {
  InventoryTransactionStatus,
  InventoryTransactionType,
} from "@/modules/inventory/types";
import { INVENTORY_TRANSACTION_STATUSES, INVENTORY_TRANSACTION_TYPES } from "@/modules/inventory/types";

export const metadata: Metadata = {
  title: "Inventory transactions",
};

function parseType(value: string | undefined): InventoryTransactionType | "all" {
  if (!value) return "all";
  return (INVENTORY_TRANSACTION_TYPES as readonly string[]).includes(value)
    ? (value as InventoryTransactionType)
    : "all";
}

function parseStatus(value: string | undefined): InventoryTransactionStatus | "all" {
  if (!value) return "all";
  return (INVENTORY_TRANSACTION_STATUSES as readonly string[]).includes(value)
    ? (value as InventoryTransactionStatus)
    : "all";
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const { tenant } = await resolvePlatformContext();
  const params = await searchParams;
  const type = parseType(params.type);
  const status = parseStatus(params.status);

  try {
    await requirePermission("inventory.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  const transactions = await listTransactions({ status, type });

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge>Inventory</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Transactions</h1>
          <p className="text-muted">
            Receipts, consumption, transfers, and adjustments. Completed documents are immutable.
          </p>
        </div>
        <Button href="/inventory" variant="ghost">
          Current stock
        </Button>
      </div>
      <TransactionsFilterTable
        transactions={transactions}
        canAdjust={can(tenant, "inventory.adjust")}
        canReceive={can(tenant, "inventory.receive")}
        canConsume={can(tenant, "inventory.consume")}
        canTransfer={can(tenant, "inventory.transfer")}
        status={status}
        type={type}
      />
    </section>
  );
}
