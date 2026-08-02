import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ItemForm } from "@/modules/catalog/components/item-form";
import { listCategories, listUnits } from "@/modules/catalog/queries";

export const metadata: Metadata = {
  title: "New item",
};

export default async function NewItemPage() {
  await resolvePlatformContext();

  try {
    await requirePermission("catalog.manage");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/administration/catalog/items");
    }
    throw error;
  }

  const [units, categories] = await Promise.all([
    listUnits({ status: "active" }),
    listCategories({ status: "active" }),
  ]);

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div className="space-y-3">
        <Badge>Catalog</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">New item</h1>
        <p className="text-muted">Define a catalog item without recording stock.</p>
      </div>
      <ItemForm mode="create" units={units} categories={categories} />
    </section>
  );
}
