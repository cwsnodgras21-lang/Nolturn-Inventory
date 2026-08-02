import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { StartMovementForm } from "@/modules/inventory/components/movement-workspace";

export const metadata: Metadata = {
  title: "Consume inventory",
};

export default async function ConsumeInventoryPage() {
  try {
    await requirePermission("inventory.consume");
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
        <h1 className="text-3xl font-semibold tracking-tight">Consume inventory</h1>
        <p className="text-muted">
          Remove stock from a source storage dimension. Respects negative-stock settings.
        </p>
      </div>
      <StartMovementForm
        transactionType="consumption"
        title="New consumption"
        description="Create a draft, add source lines, then complete."
        canStart
      />
    </section>
  );
}
