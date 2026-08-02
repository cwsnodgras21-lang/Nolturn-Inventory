import "server-only";

import type { TenantContext } from "@/lib/auth/types";
import { listLocationsForOrganization } from "@/modules/locations";
import {
  listStorageAreasForLocation,
  listStorageBinsForLocation,
} from "@/modules/storage/queries";

export async function loadAccessibleStorageContext(tenant: TenantContext) {
  const locations = (await listLocationsForOrganization(tenant.organizationId)).filter((l) =>
    tenant.allowedLocationIds.includes(l.id),
  );
  const areaLists = await Promise.all(
    locations.map((location) => listStorageAreasForLocation(location.id, { status: "active" })),
  );
  const binLists = await Promise.all(
    locations.map((location) => listStorageBinsForLocation(location.id)),
  );
  return {
    locations: locations.map((l) => ({ id: l.id, name: l.name })),
    areas: areaLists.flat(),
    bins: binLists.flat(),
  };
}
