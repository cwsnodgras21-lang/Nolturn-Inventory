import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import {
  RestockFilterBar,
  RestockPlanningWorkspace,
} from "@/modules/reorder/components/restock-workspace";
import { listRestockSuggestions } from "@/modules/reorder/queries";
import { listSuppliers } from "@/modules/suppliers/queries";

export const metadata: Metadata = {
  title: "Restock planning",
};

export default async function InventoryRestockPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { tenant } = await resolvePlatformContext();
  const params = await searchParams;

  try {
    await requirePermission("inventory.reorder.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  const stockState =
    params.state === "low" || params.state === "out" ? params.state : "all";

  const [suggestions, suppliers] = await Promise.all([
    listRestockSuggestions({ stockState }),
    can(tenant, "purchasing.read")
      ? listSuppliers({ status: "active" })
      : Promise.resolve([]),
  ]);

  const canCreateDraftOrders =
    can(tenant, "inventory.reorder.manage") && can(tenant, "purchasing.manage");

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge>Inventory</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Restock planning</h1>
          <p className="text-muted">
            Deterministic low-stock and out-of-stock suggestions from reorder rules and usable
            balances. Create draft purchase orders only — nothing is submitted automatically.
          </p>
        </div>
        <Button href="/inventory" variant="ghost">
          Back
        </Button>
      </div>

      <RestockFilterBar stockState={stockState} />
      <RestockPlanningWorkspace
        suggestions={suggestions}
        suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
        canCreateDraftOrders={canCreateDraftOrders}
      />
    </section>
  );
}
