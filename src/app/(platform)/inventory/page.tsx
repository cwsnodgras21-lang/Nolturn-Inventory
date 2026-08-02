import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { listBalances } from "@/modules/inventory/queries";
import { StockBalancesTable } from "@/modules/inventory/components/stock-balances-table";

export const metadata: Metadata = {
  title: "Inventory",
};

export default async function InventoryHomePage() {
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("inventory.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  const balances = await listBalances();

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="space-y-3">
        <Badge>Inventory</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-muted">
          Stock balances and movement workflows. Quantities come from the immutable ledger.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button href="/inventory/stock" variant="secondary">
          Current stock
        </Button>
        <Button href="/inventory/transactions" variant="secondary">
          History
        </Button>
        {can(tenant, "inventory.count.read") ? (
          <Button href="/inventory/counts" variant="secondary">
            Counts
          </Button>
        ) : null}
        {can(tenant, "inventory.receive") ? (
          <Button href="/inventory/receive">Receive</Button>
        ) : null}
        {can(tenant, "inventory.consume") ? (
          <Button href="/inventory/consume" variant="secondary">
            Consume
          </Button>
        ) : null}
        {can(tenant, "inventory.transfer") ? (
          <Button href="/inventory/transfer" variant="secondary">
            Transfer
          </Button>
        ) : null}
        {can(tenant, "inventory.adjust") ? (
          <Button href="/inventory/adjust" variant="secondary">
            Adjust
          </Button>
        ) : null}
      </div>

      <StockBalancesTable balances={balances.slice(0, 12)} />
    </section>
  );
}
