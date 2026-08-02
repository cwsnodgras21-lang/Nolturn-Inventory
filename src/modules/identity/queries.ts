import "server-only";

import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function getCurrentProfile() {
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, email, status")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new AppError("INTERNAL", "Unable to load profile.", 500);
  }

  return data;
}

export type MemberListItem = {
  id: string;
  status: string;
  location_access_mode: string;
  user_id: string;
  joined_at: string | null;
  profiles: { display_name: string | null; email: string | null } | null;
  membership_roles: Array<{ roles: { key: string; name: string } | null }>;
};

export async function listOrganizationMembers(organizationId: string): Promise<MemberListItem[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("id, status, location_access_mode, user_id, joined_at, membership_roles(roles(key, name))")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new AppError("INTERNAL", "Unable to load members.", 500);
  }

  const rows = data ?? [];
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", userIds);

  if (profileError) {
    throw new AppError("INTERNAL", "Unable to load member profiles.", 500);
  }

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  return rows.map((row) => {
    const raw = row as unknown as {
      id: string;
      status: string;
      location_access_mode: string;
      user_id: string;
      joined_at: string | null;
      membership_roles: Array<{
        roles: { key: string; name: string } | Array<{ key: string; name: string }> | null;
      }> | null;
    };

    const profile = profileById.get(raw.user_id) ?? null;

    return {
      id: raw.id,
      status: raw.status,
      location_access_mode: raw.location_access_mode,
      user_id: raw.user_id,
      joined_at: raw.joined_at,
      profiles: profile
        ? { display_name: profile.display_name, email: profile.email }
        : null,
      membership_roles: (raw.membership_roles ?? []).map((mr) => ({
        roles: asSingle(mr.roles),
      })),
    };
  });
}

export type RoleListItem = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  role_permissions: Array<{ permissions: { key: string; name: string } | null }>;
};

export async function listOrganizationRoles(organizationId: string): Promise<RoleListItem[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("roles")
    .select("id, key, name, description, is_system, role_permissions(permissions(key, name))")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (error) {
    throw new AppError("INTERNAL", "Unable to load roles.", 500);
  }

  return (data ?? []).map((row) => {
    const raw = row as unknown as {
      id: string;
      key: string;
      name: string;
      description: string | null;
      is_system: boolean;
      role_permissions: Array<{
        permissions: { key: string; name: string } | Array<{ key: string; name: string }> | null;
      }> | null;
    };

    return {
      id: raw.id,
      key: raw.key,
      name: raw.name,
      description: raw.description,
      is_system: raw.is_system,
      role_permissions: (raw.role_permissions ?? []).map((rp) => ({
        permissions: asSingle(rp.permissions),
      })),
    };
  });
}
