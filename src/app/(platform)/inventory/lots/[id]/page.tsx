import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { getLot, listLotMovements } from "@/modules/lots/queries";

export const metadata: Metadata = {
  title: "Lot detail",
};

export default async function InventoryLotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    await requirePermission("inventory.lots.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  let lot;
  try {
    lot = await getLot(id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const movements = await listLotMovements(id);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge>Inventory</Badge>
          <h1 className="text-3xl font-semibold tracking-tight font-mono">{lot.lotNumber}</h1>
          <p className="text-muted">
            {lot.itemName} ({lot.itemSku})
            {lot.variantName ? ` · ${lot.variantName}` : ""}
            {" · "}
            <span className="capitalize">{lot.status}</span>
            {lot.expirationDate ? ` · expires ${lot.expirationDate}` : ""}
          </p>
          {lot.notes ? <p className="text-sm">{lot.notes}</p> : null}
        </div>
        <Button href="/inventory/lots" variant="ghost">
          Back to lots
        </Button>
      </div>

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-surface text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Transaction</th>
              <th className="px-3 py-2 font-medium">Storage</th>
              <th className="px-3 py-2 font-medium text-right">Delta</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((movement) => (
              <tr key={movement.id} className="border-b border-border/70">
                <td className="px-3 py-2 text-muted">
                  {new Date(movement.occurredAt).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/inventory/transactions/${movement.transactionId}`}
                    className="underline underline-offset-2"
                  >
                    {movement.transactionNumber ?? "Transaction"}
                  </Link>
                  <div className="text-xs capitalize text-muted">
                    {(movement.transactionType ?? "").replaceAll("_", " ")}
                  </div>
                </td>
                <td className="px-3 py-2 text-muted">
                  {movement.locationName} / {movement.storageAreaName}
                  {movement.binName ? ` / ${movement.binName}` : ""}
                </td>
                <td className="px-3 py-2 text-right font-medium">
                  {movement.quantityDelta > 0 ? "+" : ""}
                  {movement.quantityDelta}
                </td>
              </tr>
            ))}
            {movements.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted">
                  No ledger movements for this lot yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
