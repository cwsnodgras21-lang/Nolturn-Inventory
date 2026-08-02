import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { CreateCountForm } from "@/modules/counts/components/count-workspace";
import { loadAccessibleStorageContext } from "@/modules/inventory/load-context";

export const metadata: Metadata = {
  title: "New inventory count",
};

export default async function NewInventoryCountPage() {
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("inventory.count.perform");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/inventory/counts");
    }
    throw error;
  }

  const { locations } = await loadAccessibleStorageContext(tenant);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge>Inventory</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">New count</h1>
        </div>
        <Button href="/inventory/counts" variant="ghost">
          Back to counts
        </Button>
      </div>
      <CreateCountForm locations={locations} canCreate={can(tenant, "inventory.count.perform")} />
    </section>
  );
}
