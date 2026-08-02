import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { StartMovementForm } from "@/modules/inventory/components/movement-workspace";

export const metadata: Metadata = {
  title: "Adjust inventory",
};

export default async function AdjustInventoryPage() {
  try {
    await requirePermission("inventory.adjust");
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
        <h1 className="text-3xl font-semibold tracking-tight">Adjust inventory</h1>
        <p className="text-muted">
          Positive adjustments and opening balances add stock. Negative adjustments remove stock
          and require a reason.
        </p>
      </div>
      <StartMovementForm
        transactionType="positive_adjustment"
        title="New adjustment"
        description="Choose the adjustment type, add notes or a reason, then add lines on the draft."
        canStart
        allowTypeSelect
      />
    </section>
  );
}
