import "server-only";

import { cookies } from "next/headers";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AuthenticatedUser, TenantContext } from "@/lib/auth/types";
import type { PermissionKey } from "@/lib/permissions/catalog";
import { isPermissionKey } from "@/lib/permissions/catalog";

export type { AuthenticatedUser, TenantContext, LocationAccessMode } from "@/lib/auth/types";

type OrgEmbed = { id: string; name: string; slug: string; status: string };
type PermissionEmbed = { key: string };
type RolePermissionEmbed = { permissions: PermissionEmbed | PermissionEmbed[] | null };
type RoleEmbed = {
  key: string;
  role_permissions: RolePermissionEmbed[] | null;
};

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AppError("UNAUTHENTICATED", "Sign in required.", 401);
  }

  return {
    id: user.id,
    email: user.email ?? null,
  };
}

export async function getOptionalUser(): Promise<AuthenticatedUser | null> {
  try {
    return await requireUser();
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHENTICATED") {
      return null;
    }
    throw error;
  }
}

async function resolveMembershipContext(
  userId: string,
  organizationId: string,
): Promise<TenantContext> {
  const supabase = await createServerSupabaseClient();

  const { data: membershipRaw, error: membershipError } = await supabase
    .from("organization_memberships")
    .select(
      "id, status, location_access_mode, organization_id, organizations!inner(id, name, slug, status)",
    )
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (membershipError) {
    throw new AppError("INTERNAL", "Unable to resolve membership.", 500);
  }

  const membership = membershipRaw as
    | {
        id: string;
        status: string;
        location_access_mode: "all" | "restricted";
        organization_id: string;
        organizations: OrgEmbed | OrgEmbed[];
      }
    | null;

  if (!membership || membership.status !== "active") {
    throw new AppError("MEMBERSHIP_REQUIRED", "Active organization membership required.", 403);
  }

  const organization = asSingle(membership.organizations);
  if (!organization || organization.status !== "active") {
    throw new AppError("MEMBERSHIP_REQUIRED", "Organization is not available.", 403);
  }

  const { data: roleRowsRaw, error: roleError } = await supabase
    .from("membership_roles")
    .select("roles!inner(key, role_permissions(permissions(key)))")
    .eq("membership_id", membership.id);

  if (roleError) {
    throw new AppError("INTERNAL", "Unable to resolve roles.", 500);
  }

  const roleRows = (roleRowsRaw ?? []) as unknown as Array<{
    roles: RoleEmbed | RoleEmbed[];
  }>;
  const roleKeys = new Set<string>();
  const permissionKeys = new Set<string>();

  for (const row of roleRows) {
    const role = asSingle(row.roles);
    if (!role) continue;
    roleKeys.add(role.key);
    for (const rp of role.role_permissions ?? []) {
      const permission = asSingle(rp.permissions);
      if (permission?.key) {
        permissionKeys.add(permission.key);
      }
    }
  }

  let allowedLocationIds: string[] = [];
  if (membership.location_access_mode === "restricted") {
    const { data: scopes, error: scopeError } = await supabase
      .from("membership_location_scopes")
      .select("location_id")
      .eq("membership_id", membership.id);

    if (scopeError) {
      throw new AppError("INTERNAL", "Unable to resolve location scopes.", 500);
    }
    allowedLocationIds = (scopes ?? []).map((s) => s.location_id);
  } else {
    const { data: locations, error: locationError } = await supabase
      .from("locations")
      .select("id")
      .eq("organization_id", organizationId);

    if (locationError) {
      throw new AppError("INTERNAL", "Unable to resolve locations.", 500);
    }
    allowedLocationIds = (locations ?? []).map((l) => l.id);
  }

  return {
    userId,
    organizationId: organization.id,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    membershipId: membership.id,
    membershipStatus: "active",
    permissionKeys: [...permissionKeys],
    roleKeys: [...roleKeys],
    locationAccessMode: membership.location_access_mode,
    allowedLocationIds,
  };
}

export async function requireTenantContext(
  requestedOrganizationId?: string | null,
): Promise<TenantContext> {
  const user = await requireUser();
  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value ?? null;
  const candidateOrgId = requestedOrganizationId?.trim() || cookieOrgId;

  if (!candidateOrgId) {
    throw new AppError("MEMBERSHIP_REQUIRED", "Select an organization to continue.", 403);
  }

  return resolveMembershipContext(user.id, candidateOrgId);
}

export async function requirePermission(
  permissionKey: PermissionKey,
  requestedOrganizationId?: string | null,
): Promise<TenantContext> {
  const context = await requireTenantContext(requestedOrganizationId);
  if (!context.permissionKeys.includes(permissionKey)) {
    throw new AppError("PERMISSION_DENIED", "You do not have permission for this action.", 403);
  }
  return context;
}

export async function requireAnyPermission(
  permissionKeys: PermissionKey[],
  requestedOrganizationId?: string | null,
): Promise<TenantContext> {
  const context = await requireTenantContext(requestedOrganizationId);
  const allowed = permissionKeys.some((key) => context.permissionKeys.includes(key));
  if (!allowed) {
    throw new AppError("PERMISSION_DENIED", "You do not have permission for this action.", 403);
  }
  return context;
}

export async function requireLocationAccess(
  locationId: string,
  requestedOrganizationId?: string | null,
): Promise<TenantContext> {
  const context = await requireTenantContext(requestedOrganizationId);

  if (context.locationAccessMode === "all") {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("locations")
      .select("id")
      .eq("id", locationId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (error || !data) {
      throw new AppError("LOCATION_DENIED", "Location is not accessible.", 403);
    }
    return context;
  }

  if (!context.allowedLocationIds.includes(locationId)) {
    throw new AppError("LOCATION_DENIED", "Location is not accessible.", 403);
  }

  return context;
}

export function tenantHasPermission(context: TenantContext, key: string): boolean {
  return isPermissionKey(key) && context.permissionKeys.includes(key);
}
