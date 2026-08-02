import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { RecallsTable } from "@/modules/recalls/components/recall-workspace";
import { listRecalls } from "@/modules/recalls/queries";

export const metadata: Metadata = {
  title: "Recalls",
};

export default async function InventoryRecallsPage() {
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("inventory.recalls.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  const recalls = await listRecalls();

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge>Inventory</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Recalls</h1>
          <p className="text-muted">
            Identify affected lots, quarantine stock, and keep an audit trail. Resolving a recall
            does not release quarantined lots.
          </p>
        </div>
        <div className="flex gap-2">
          <Button href="/inventory" variant="ghost">
            Back
          </Button>
          {can(tenant, "inventory.recalls.manage") ? (
            <Button href="/inventory/recalls/new">New recall</Button>
          ) : null}
        </div>
      </div>
      <RecallsTable recalls={recalls} />
    </section>
  );
}
