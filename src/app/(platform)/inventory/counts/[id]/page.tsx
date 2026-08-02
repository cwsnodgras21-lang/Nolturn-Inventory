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
import { CountWorkspace } from "@/modules/counts/components/count-workspace";
import { getCountSession, listCountLines } from "@/modules/counts/queries";
import { shouldRevealExpectedQuantity } from "@/modules/counts/types";
import { loadAccessibleStorageContext } from "@/modules/inventory/load-context";

export const metadata: Metadata = {
  title: "Count detail",
};

export default async function InventoryCountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("inventory.count.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  let session;
  try {
    session = await getCountSession(id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const [{ locations, areas, bins }, lines, items, variants, units] = await Promise.all([
    loadAccessibleStorageContext(tenant),
    listCountLines(id),
    listItems({ status: "active" }),
    listAllVariants(),
    listUnits({ status: "active" }),
  ]);

  const canReview = can(tenant, "inventory.count.review");
  const revealExpected = shouldRevealExpectedQuantity({
    blindCountEnabled: session.blindCountEnabled,
    sessionStatus: session.status,
    canReview,
  });

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge>Inventory</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Count detail</h1>
        </div>
        <Button href="/inventory/counts" variant="ghost">
          Back to counts
        </Button>
      </div>
      <CountWorkspace
        session={session}
        lines={lines}
        items={items}
        variants={variants}
        units={units}
        locations={locations}
        areas={areas}
        bins={bins}
        canPerform={can(tenant, "inventory.count.perform")}
        canReview={canReview}
        revealExpected={revealExpected}
      />
    </section>
  );
}
