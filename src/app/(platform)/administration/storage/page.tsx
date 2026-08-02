import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { listLocationsForOrganization } from "@/modules/locations";
import { StoragePanel } from "@/modules/storage/components/storage-panel";
import {
  getStorageAreaTree,
  listStorageAreasForLocation,
  listStorageBinsForLocation,
} from "@/modules/storage/queries";

export const metadata: Metadata = {
  title: "Storage",
};

export default async function StorageAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string }>;
}) {
  const { tenant } = await resolvePlatformContext();
  const params = await searchParams;

  try {
    await requirePermission("inventory.storage.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  const locations = await listLocationsForOrganization(tenant.organizationId);
  const accessible = locations.filter((location) =>
    tenant.allowedLocationIds.includes(location.id),
  );

  if (accessible.length === 0) {
    return (
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <div className="space-y-3">
          <Badge>Storage</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Storage</h1>
          <p className="text-muted">No accessible locations are available for storage management.</p>
        </div>
      </section>
    );
  }

  const selectedLocationId =
    params.locationId && accessible.some((l) => l.id === params.locationId)
      ? params.locationId
      : accessible[0]!.id;

  const [tree, areas, bins] = await Promise.all([
    getStorageAreaTree(selectedLocationId, { status: "all" }),
    listStorageAreasForLocation(selectedLocationId, { status: "all" }),
    listStorageBinsForLocation(selectedLocationId),
  ]);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="space-y-3">
        <Badge>Storage</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Storage hierarchy</h1>
        <p className="text-muted">
          Physical rooms, cabinets, shelves, and optional bins within each location. Stock
          quantities are not tracked here.
        </p>
      </div>
      <StoragePanel
        locations={accessible.map((l) => ({ id: l.id, name: l.name, code: l.code }))}
        selectedLocationId={selectedLocationId}
        tree={tree}
        areas={areas}
        bins={bins}
        canManage={can(tenant, "inventory.storage.manage")}
      />
    </section>
  );
}
