import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { listLots } from "@/modules/lots/queries";
import { RecallWorkspace } from "@/modules/recalls/components/recall-workspace";
import {
  getRecall,
  listAffectedStock,
  listRecallAuditEvents,
  listRecallLots,
} from "@/modules/recalls/queries";

export const metadata: Metadata = {
  title: "Recall detail",
};

export default async function RecallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("inventory.recalls.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  let recall;
  try {
    recall = await getRecall(id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const canReadLots = can(tenant, "inventory.lots.read");
  const [lots, affectedStock, auditEvents, availableLots] = await Promise.all([
    listRecallLots(id),
    listAffectedStock(id),
    listRecallAuditEvents(id),
    canReadLots ? listLots() : Promise.resolve([]),
  ]);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge>Inventory</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Recall detail</h1>
        </div>
        <Button href="/inventory/recalls" variant="ghost">
          Back to recalls
        </Button>
      </div>
      <RecallWorkspace
        recall={recall}
        lots={lots}
        availableLots={availableLots}
        affectedStock={affectedStock}
        auditEvents={auditEvents}
        canManage={can(tenant, "inventory.recalls.manage")}
      />
    </section>
  );
}
