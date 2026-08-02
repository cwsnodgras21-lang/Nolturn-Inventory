import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { UnitsCatalogPanel } from "@/modules/catalog/components/units-panel";
import { listUnits } from "@/modules/catalog/queries";

export const metadata: Metadata = {
  title: "Units of measure",
};

export default async function UnitsAdminPage() {
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("catalog.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  const units = await listUnits({ status: "all" });

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="space-y-3">
        <Badge>Catalog</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Units of measure</h1>
        <p className="text-muted">
          Tenant-owned units. Item-specific conversions to each item&apos;s base unit are managed on
          the item detail page.
        </p>
      </div>
      <UnitsCatalogPanel units={units} canManage={can(tenant, "catalog.manage")} />
    </section>
  );
}
