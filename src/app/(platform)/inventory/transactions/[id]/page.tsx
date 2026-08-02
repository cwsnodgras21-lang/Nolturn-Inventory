import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { listAllVariants, listItems } from "@/modules/catalog/item-queries";
import { listUnits } from "@/modules/catalog/queries";
import { TransactionWorkspace } from "@/modules/inventory/components/movement-workspace";
import { loadAccessibleStorageContext } from "@/modules/inventory/load-context";
import {
  getLinkedTransactionNumber,
  getTransaction,
  listTransactionLines,
} from "@/modules/inventory/queries";
import {
  isReversibleTransaction,
  permissionForTransactionType,
} from "@/modules/inventory/types";

export const metadata: Metadata = {
  title: "Transaction detail",
};

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("inventory.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  let transaction;
  try {
    transaction = await getTransaction(id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const [{ locations, areas, bins }, lines, items, variants, units, linkedOriginalNumber, linkedReversalNumber] =
    await Promise.all([
      loadAccessibleStorageContext(tenant),
      listTransactionLines(id),
      listItems({ status: "active" }),
      listAllVariants(),
      listUnits({ status: "active" }),
      getLinkedTransactionNumber(transaction.reversesTransactionId),
      getLinkedTransactionNumber(transaction.reversedByTransactionId),
    ]);

  const managePermission = permissionForTransactionType(transaction.transactionType);
  const canManage =
    transaction.transactionType === "reversal"
      ? false
      : can(tenant, managePermission);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge>Inventory</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Transaction detail</h1>
        </div>
        <Button href="/inventory/transactions" variant="ghost">
          Back to list
        </Button>
      </div>
      <TransactionWorkspace
        transaction={transaction}
        lines={lines}
        items={items}
        variants={variants}
        units={units}
        locations={locations}
        areas={areas}
        bins={bins}
        canManage={canManage}
        canReverse={can(tenant, "inventory.reverse") && isReversibleTransaction(transaction)}
        linkedOriginalNumber={linkedOriginalNumber}
        linkedReversalNumber={linkedReversalNumber}
      />
    </section>
  );
}
