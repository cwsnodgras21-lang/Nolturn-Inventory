import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { listPurchaseOrders } from "@/modules/procurement/queries";
import { PURCHASE_ORDER_STATUSES, type PurchaseOrderStatus } from "@/modules/procurement/types";
import { listSuppliers } from "@/modules/suppliers/queries";
import { listLocationsForOrganization } from "@/modules/locations";

export const metadata: Metadata = {
  title: "Purchase orders",
};

function parseStatus(value: string | undefined): PurchaseOrderStatus | "all" {
  if (!value || value === "all") return "all";
  return (PURCHASE_ORDER_STATUSES as readonly string[]).includes(value)
    ? (value as PurchaseOrderStatus)
    : "all";
}

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; supplierId?: string; locationId?: string }>;
}) {
  const params = await searchParams;
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("purchasing.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  const status = parseStatus(params.status);
  const [orders, suppliers, allLocations] = await Promise.all([
    listPurchaseOrders({
      status,
      supplierId: params.supplierId || undefined,
      locationId: params.locationId || undefined,
    }),
    listSuppliers({ status: "active" }),
    listLocationsForOrganization(tenant.organizationId),
  ]);
  const locations = allLocations.filter((location) =>
    tenant.allowedLocationIds.includes(location.id),
  );

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge>Purchasing</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Purchase orders</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(tenant, "purchasing.manage") ? (
            <Button href="/purchasing/orders/new">New order</Button>
          ) : null}
          <Button href="/purchasing" variant="ghost">
            Back
          </Button>
        </div>
      </div>

      <form method="get" className="flex flex-wrap gap-3">
        <select
          name="status"
          defaultValue={status}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          {PURCHASE_ORDER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select
          name="supplierId"
          defaultValue={params.supplierId ?? ""}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">All suppliers</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
        <select
          name="locationId"
          defaultValue={params.locationId ?? ""}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">All locations</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-surface text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">PO</th>
              <th className="px-3 py-2 font-medium">Supplier</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Ship to</th>
              <th className="px-3 py-2 font-medium">Order date</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-border/70">
                <td className="px-3 py-2 font-medium">{order.poNumber}</td>
                <td className="px-3 py-2">{order.supplierName || "—"}</td>
                <td className="px-3 py-2 capitalize">{order.status.replaceAll("_", " ")}</td>
                <td className="px-3 py-2 text-muted">{order.shipToLocationName || "—"}</td>
                <td className="px-3 py-2 text-muted">{order.orderDate}</td>
                <td className="px-3 py-2 text-right">
                  <Button href={`/purchasing/orders/${order.id}`} variant="ghost">
                    Open
                  </Button>
                </td>
              </tr>
            ))}
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted">
                  No purchase orders yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
