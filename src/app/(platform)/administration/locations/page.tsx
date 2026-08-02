import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { CreateLocationForm } from "@/components/locations/create-location-form";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { listLocationsForOrganization } from "@/modules/locations";
import { can } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Locations",
};

export default async function LocationsAdminPage() {
  const { tenant } = await resolvePlatformContext();

  try {
    await requirePermission("locations.read");
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMISSION_DENIED") {
      redirect("/dashboard");
    }
    throw error;
  }

  const locations = await listLocationsForOrganization(tenant.organizationId);
  const canManage = can(tenant, "locations.manage");

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div className="space-y-3">
        <Badge>Locations</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Locations</h1>
        <p className="text-muted">
          Access mode: {tenant.locationAccessMode}. Restricted members only see assigned locations.
        </p>
      </div>

      {canManage ? <CreateLocationForm /> : null}

      {locations.length === 0 ? (
        <p className="text-sm text-muted">No locations yet.</p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {locations.map((location) => (
            <li key={location.id} className="flex items-center justify-between gap-4 bg-surface px-4 py-3">
              <div>
                <p className="font-medium">{location.name}</p>
                <p className="text-xs text-muted">
                  {[location.code, location.city, location.state_region, location.country_code]
                    .filter(Boolean)
                    .join(" · ") || "No address"}
                </p>
              </div>
              <span className="text-xs uppercase tracking-wide text-muted">{location.status}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
