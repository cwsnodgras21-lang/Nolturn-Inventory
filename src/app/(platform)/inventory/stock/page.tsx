import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { StockFilterPanel } from "@/modules/inventory/components/stock-filter-panel";
import { loadAccessibleStorageContext } from "@/modules/inventory/load-context";
import { listBalances } from "@/modules/inventory/queries";

export const metadata: Metadata = {
  title: "Current stock",
};

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{
    locationId?: string;
    storageAreaId?: string;
    search?: string;
  }>;
}) {
  const { tenant } = await resolvePlatformContext();
  const params = await searchParams;

  try {
    await requirePermission("inventory.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  const [{ locations, areas }, balances] = await Promise.all([
    loadAccessibleStorageContext(tenant),
    listBalances({
      locationId: params.locationId,
      storageAreaId: params.storageAreaId,
      search: params.search,
    }),
  ]);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge>Inventory</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Current stock</h1>
          <p className="text-muted">Filter by location, storage area, and item.</p>
        </div>
        <Button href="/inventory" variant="ghost">
          Back
        </Button>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Loading filters…</p>}>
        <StockFilterPanel
          balances={balances}
          locations={locations}
          areas={areas.map((a) => ({ id: a.id, name: a.name, locationId: a.locationId }))}
        />
      </Suspense>
    </section>
  );
}
