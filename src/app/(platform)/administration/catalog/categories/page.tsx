import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { CategoriesCatalogPanel } from "@/modules/catalog/components/categories-panel";
import { getCategoryTree, listCategories } from "@/modules/catalog/queries";

export const metadata: Metadata = {
  title: "Item categories",
};

export default async function CategoriesAdminPage() {
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("catalog.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  const [tree, flat] = await Promise.all([
    getCategoryTree({ status: "all" }),
    listCategories({ status: "all" }),
  ]);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="space-y-3">
        <Badge>Catalog</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Item categories</h1>
        <p className="text-muted">
          Hierarchical categories for future catalog items. Cycles and cross-organization parents
          are rejected.
        </p>
      </div>
      <CategoriesCatalogPanel
        tree={tree}
        flat={flat}
        canManage={can(tenant, "catalog.manage")}
      />
    </section>
  );
}
