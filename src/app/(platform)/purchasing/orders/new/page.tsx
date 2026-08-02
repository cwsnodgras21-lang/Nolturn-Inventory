import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { AppError } from "@/lib/errors";
import { CreatePurchaseOrderForm } from "@/modules/procurement/components/purchase-order-workspace";
import { listLocationsForOrganization } from "@/modules/locations";
import { listSuppliers } from "@/modules/suppliers/queries";

export const metadata: Metadata = {
  title: "New purchase order",
};

export default async function NewPurchaseOrderPage() {
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("purchasing.manage");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/purchasing/orders");
    }
    throw error;
  }

  const [suppliers, allLocations] = await Promise.all([
    listSuppliers({ status: "active" }),
    listLocationsForOrganization(tenant.organizationId),
  ]);
  const locations = allLocations
    .filter((location) => tenant.allowedLocationIds.includes(location.id))
    .map((location) => ({ id: location.id, name: location.name }));

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge>Purchasing</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">New purchase order</h1>
        </div>
        <Button href="/purchasing/orders" variant="ghost">
          Back
        </Button>
      </div>
      {suppliers.length === 0 || locations.length === 0 ? (
        <p className="text-muted">
          Create an active supplier and ensure you can access a ship-to location before creating a
          purchase order.
        </p>
      ) : (
        <CreatePurchaseOrderForm suppliers={suppliers} locations={locations} canManage />
      )}
    </section>
  );
}
