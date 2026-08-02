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
import { PurchaseOrderWorkspace } from "@/modules/procurement/components/purchase-order-workspace";
import {
  getPurchaseOrder,
  listPurchaseOrderLines,
  listPurchaseOrderReceipts,
} from "@/modules/procurement/queries";
import { loadAccessibleStorageContext } from "@/modules/inventory/load-context";

export const metadata: Metadata = {
  title: "Purchase order detail",
};

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("purchasing.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  let order;
  try {
    order = await getPurchaseOrder(id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const [{ locations, areas, bins }, lines, receipts, items, variants, units] = await Promise.all([
    loadAccessibleStorageContext(tenant),
    listPurchaseOrderLines(id),
    listPurchaseOrderReceipts(id),
    listItems({ status: "active" }),
    listAllVariants(),
    listUnits({ status: "active" }),
  ]);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge>Purchasing</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Purchase order</h1>
        </div>
        <Button href="/purchasing/orders" variant="ghost">
          Back to orders
        </Button>
      </div>
      <PurchaseOrderWorkspace
        order={order}
        lines={lines}
        receipts={receipts}
        items={items}
        variants={variants}
        units={units}
        locations={locations}
        areas={areas}
        bins={bins}
        canManage={can(tenant, "purchasing.manage")}
        canReceive={can(tenant, "purchasing.receive")}
      />
    </section>
  );
}
