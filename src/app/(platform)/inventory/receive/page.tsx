import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { StartMovementForm } from "@/modules/inventory/components/movement-workspace";

export const metadata: Metadata = {
  title: "Receive inventory",
};

export default async function ReceiveInventoryPage() {
  try {
    await requirePermission("inventory.receive");
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
        <h1 className="text-3xl font-semibold tracking-tight">Receive inventory</h1>
        <p className="text-muted">
          Add stock to a destination location. No purchase order or supplier required.
        </p>
      </div>
      <StartMovementForm
        transactionType="receipt"
        title="New receipt"
        description="Create a draft, add lines with optional unit cost and reference, then complete."
        canStart
      />
    </section>
  );
}
