"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { AppError, toSafeErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AUDIT_ACTIONS, writeAuditEvent } from "@/modules/audit";
import { createLocationSchema, updateLocationSchema } from "@/modules/locations/schemas";
import type { Tables } from "@/lib/supabase/types";

export type LocationActionResult =
  | { ok: true; locationId?: string }
  | { ok: false; error: string };

export type LocationListItem = Pick<
  Tables<"locations">,
  "id" | "name" | "code" | "status" | "timezone" | "city" | "state_region" | "country_code" | "address_line_1"
>;

export async function createLocationAction(raw: unknown): Promise<LocationActionResult> {
  try {
    const input = createLocationSchema.parse(raw);
    const context = await requirePermission("locations.manage");
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("locations")
      .insert({
        organization_id: context.organizationId,
        name: input.name,
        code: input.code ?? null,
        timezone: input.timezone ?? null,
        country_code: input.countryCode ?? null,
        address_line_1: input.addressLine1 ?? null,
        city: input.city ?? null,
        state_region: input.stateRegion ?? null,
        postal_code: input.postalCode ?? null,
        status: "active",
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new AppError("INTERNAL", error?.message ?? "Unable to create location.", 500);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.LOCATION_CREATED,
      entityType: "location",
      entityId: data.id,
      summary: `Location created: ${input.name}`,
      metadata: { code: input.code ?? null },
    });

    revalidatePath("/administration/locations");
    return { ok: true, locationId: data.id };
  } catch (error) {
    return { ok: false, error: toSafeErrorMessage(error) };
  }
}

export async function updateLocationAction(
  locationId: string,
  raw: unknown,
): Promise<LocationActionResult> {
  try {
    const input = updateLocationSchema.parse(raw);
    const context = await requirePermission("locations.manage");
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from("locations")
      .update({
        ...(input.name ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code ?? null } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone ?? null } : {}),
        ...(input.countryCode !== undefined ? { country_code: input.countryCode ?? null } : {}),
        ...(input.addressLine1 !== undefined ? { address_line_1: input.addressLine1 ?? null } : {}),
        ...(input.city !== undefined ? { city: input.city ?? null } : {}),
        ...(input.stateRegion !== undefined ? { state_region: input.stateRegion ?? null } : {}),
        ...(input.postalCode !== undefined ? { postal_code: input.postalCode ?? null } : {}),
        ...(input.status ? { status: input.status } : {}),
      })
      .eq("id", locationId)
      .eq("organization_id", context.organizationId);

    if (error) {
      throw new AppError("INTERNAL", "Unable to update location.", 500);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.LOCATION_UPDATED,
      entityType: "location",
      entityId: locationId,
      summary: "Location updated",
    });

    revalidatePath("/administration/locations");
    return { ok: true, locationId };
  } catch (error) {
    return { ok: false, error: toSafeErrorMessage(error) };
  }
}

export async function listLocationsForOrganization(
  organizationId: string,
): Promise<LocationListItem[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("locations")
    .select(
      "id, name, code, status, timezone, city, state_region, country_code, address_line_1",
    )
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (error) {
    throw new AppError("INTERNAL", "Unable to load locations.", 500);
  }

  return (data ?? []) as LocationListItem[];
}
