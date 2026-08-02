import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { ItemsListPanel } from "@/modules/catalog/components/items-list-panel";
import { listItems } from "@/modules/catalog/item-queries";
import { listCategories } from "@/modules/catalog/queries";

export const metadata: Metadata = {
  title: "Catalog items",
};

export default async function ItemsAdminPage() {
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("catalog.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  const [items, categories] = await Promise.all([
    listItems({ status: "all" }),
    listCategories({ status: "all" }),
  ]);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="space-y-3">
        <Badge>Catalog</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Items</h1>
        <p className="text-muted">
          Reusable catalog definitions — names, units, SKUs, and identifiers. Stock quantities are
          not tracked here.
        </p>
      </div>
      <ItemsListPanel
        items={items}
        categories={categories}
        canManage={can(tenant, "catalog.manage")}
      />
    </section>
  );
}
