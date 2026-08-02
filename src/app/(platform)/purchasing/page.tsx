import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Purchasing",
};

export default async function PurchasingHomePage() {
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("purchasing.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="space-y-3">
        <Badge>Purchasing</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Purchasing</h1>
        <p className="text-muted">
          Suppliers and purchase orders. Receiving posts through the inventory ledger.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button href="/purchasing/orders">Purchase orders</Button>
        <Button href="/purchasing/suppliers" variant="secondary">
          Suppliers
        </Button>
        {can(tenant, "purchasing.manage") ? (
          <Button href="/purchasing/orders/new" variant="secondary">
            New order
          </Button>
        ) : null}
      </div>
    </section>
  );
}
