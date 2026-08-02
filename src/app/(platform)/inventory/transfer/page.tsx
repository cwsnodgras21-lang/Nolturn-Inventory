import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { StartMovementForm } from "@/modules/inventory/components/movement-workspace";

export const metadata: Metadata = {
  title: "Transfer inventory",
};

export default async function TransferInventoryPage() {
  try {
    await requirePermission("inventory.transfer");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/inventory");
    }
    throw error;
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div className="space-y-3">
        <Badge>Inventory</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Transfer inventory</h1>
        <p className="text-muted">
          Move stock between storage dimensions in the same organization. Source and destination
          must differ.
        </p>
      </div>
      <StartMovementForm
        transactionType="transfer"
        title="New transfer"
        description="Create a draft, set source and destination on each line, then complete."
        canStart
      />
    </section>
  );
}
