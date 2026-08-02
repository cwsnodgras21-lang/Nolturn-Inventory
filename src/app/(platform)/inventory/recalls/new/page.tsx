import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { CreateRecallForm } from "@/modules/recalls/components/recall-workspace";

export const metadata: Metadata = {
  title: "New recall",
};

export default async function NewRecallPage() {
  try {
    await requirePermission("inventory.recalls.manage");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge>Inventory</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">New recall</h1>
        </div>
        <Button href="/inventory/recalls" variant="ghost">
          Back to recalls
        </Button>
      </div>
      <CreateRecallForm canManage />
    </section>
  );
}
