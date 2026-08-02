import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { ItemDetailPanels } from "@/modules/catalog/components/item-detail-panels";
import {
  getItem,
  listItemConversions,
  listItemIdentifiers,
  listItemVariants,
} from "@/modules/catalog/item-queries";
import { listUnits } from "@/modules/catalog/queries";
import { ItemLotsPanel } from "@/modules/lots/components/lots-panel";
import { listLots } from "@/modules/lots/queries";

export const metadata: Metadata = {
  title: "Item detail",
};

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("catalog.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
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

  const canReadLots = can(tenant, "inventory.lots.read");
  const [variants, conversions, identifiers, units, lots] = await Promise.all([
    listItemVariants(id),
    listItemConversions(id),
    listItemIdentifiers(id),
    listUnits({ status: "all" }),
    canReadLots ? listLots({ itemId: id }) : Promise.resolve([]),
  ]);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge>Catalog</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">{item.name}</h1>
          <p className="text-muted">
            SKU <span className="font-mono text-foreground">{item.sku}</span>
            {" · "}
            Base {item.baseUnitSymbol ?? "—"}
            {" · "}
            Entry {item.defaultEntryUnitSymbol ?? "—"}
            {" · "}
            <span className="capitalize">{item.status}</span>
          </p>
          {item.description ? <p className="max-w-2xl text-sm">{item.description}</p> : null}
          <p className="text-sm text-muted">
            Category: {item.categoryName ?? "None"}
            {item.requiresVariant ? " · Variants required for future stock moves" : null}
            {item.allowNegativeStock ? " · Negative stock allowed (future)" : null}
            {" · "}
            Tracking: {item.trackingMode === "lot" ? "lot" : "quantity"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button href="/administration/catalog/items" variant="ghost">
            Back to list
          </Button>
          {can(tenant, "catalog.manage") ? (
            <Button href={`/administration/catalog/items/${item.id}/edit`} variant="secondary">
              Edit
            </Button>
          ) : null}
        </div>
      </div>

      <ItemDetailPanels
        item={item}
        variants={variants}
        conversions={conversions}
        identifiers={identifiers}
        units={units}
        canManage={can(tenant, "catalog.manage")}
      />

      {canReadLots || can(tenant, "inventory.lots.manage") ? (
        <ItemLotsPanel
          itemId={item.id}
          trackingMode={item.trackingMode}
          variants={variants.map((variant) => ({ id: variant.id, name: variant.name }))}
          lots={lots}
          canManageLots={can(tenant, "inventory.lots.manage")}
        />
      ) : null}
    </section>
  );
}
