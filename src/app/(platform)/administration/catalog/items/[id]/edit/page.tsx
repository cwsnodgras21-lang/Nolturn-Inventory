import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { AppError } from "@/lib/errors";
import { ItemForm } from "@/modules/catalog/components/item-form";
import { getItem } from "@/modules/catalog/item-queries";
import { listCategories, listUnits } from "@/modules/catalog/queries";

export const metadata: Metadata = {
  title: "Edit item",
};

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await resolvePlatformContext();

  try {
    await requirePermission("catalog.manage");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect(`/administration/catalog/items/${id}`);
    }
    throw error;
  }

  let item;
  try {
    item = await getItem(id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const [units, categories] = await Promise.all([
    listUnits({ status: "all" }),
    listCategories({ status: "all" }),
  ]);

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div className="space-y-3">
        <Badge>Catalog</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Edit item</h1>
        <p className="text-muted">{item.name}</p>
      </div>
      <ItemForm mode="edit" item={item} units={units} categories={categories} />
    </section>
  );
}
