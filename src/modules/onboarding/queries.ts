import "server-only";

import { requirePermission, requireTenantContext } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildOnboardingChecklist,
  onboardingProgressPercent,
  requiredStepsComplete,
} from "@/modules/onboarding/checklist";
import type {
  InvitationListItem,
  OnboardingState,
  OnboardingStep,
  StarterPack,
} from "@/modules/onboarding/types";

function mapOnboarding(row: {
  organization_id: string;
  status: string;
  current_step: string;
  starter_pack: string | null;
  demo_data_enabled: boolean;
  details_completed_at: string | null;
  location_completed_at: string | null;
  invite_completed_at: string | null;
  invite_skipped: boolean;
  starter_completed_at: string | null;
  catalog_completed_at: string | null;
  catalog_skipped: boolean;
  modules_completed_at: string | null;
  completed_at: string | null;
}): OnboardingState {
  return {
    organizationId: row.organization_id,
    status: row.status as OnboardingState["status"],
    currentStep: row.current_step as OnboardingStep,
    starterPack: row.starter_pack as StarterPack | null,
    demoDataEnabled: row.demo_data_enabled,
    detailsCompletedAt: row.details_completed_at,
    locationCompletedAt: row.location_completed_at,
    inviteCompletedAt: row.invite_completed_at,
    inviteSkipped: row.invite_skipped,
    starterCompletedAt: row.starter_completed_at,
    catalogCompletedAt: row.catalog_completed_at,
    catalogSkipped: row.catalog_skipped,
    modulesCompletedAt: row.modules_completed_at,
    completedAt: row.completed_at,
  };
}

export async function getOnboardingState(
  organizationId?: string,
): Promise<OnboardingState | null> {
  const context = organizationId
    ? await requireTenantContext(organizationId)
    : await requirePermission("organization.read");
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("organization_onboarding")
    .select("*")
    .eq("organization_id", context.organizationId)
    .maybeSingle();

  if (error) {
    throw new AppError("INTERNAL", "Unable to load onboarding state.", 500);
  }
  if (!data) return null;
  return mapOnboarding(data);
}

export async function getOnboardingDashboardSummary() {
  const state = await getOnboardingState();
  if (!state) {
    return {
      state: null,
      checklist: [],
      progressPercent: 0,
      canComplete: false,
      isComplete: false,
    };
  }
  return {
    state,
    checklist: buildOnboardingChecklist(state),
    progressPercent: onboardingProgressPercent(state),
    canComplete: requiredStepsComplete(state),
    isComplete: state.status === "completed",
  };
}

export async function listOrganizationInvitations(): Promise<InvitationListItem[]> {
  const context = await requirePermission("members.read");
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("organization_invitations")
    .select("id, email, status, role_id, location_access_mode, expires_at, created_at")
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new AppError("INTERNAL", "Unable to load invitations.", 500);
  }

  const roleIds = [...new Set((data ?? []).map((row) => row.role_id))];
  const { data: roles } = roleIds.length
    ? await supabase.from("roles").select("id, name").in("id", roleIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const roleNameById = new Map((roles ?? []).map((r) => [r.id, r.name]));

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    status: row.status as InvitationListItem["status"],
    roleId: row.role_id,
    roleName: roleNameById.get(row.role_id) ?? "Role",
    locationAccessMode: row.location_access_mode as "all" | "restricted",
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}

export async function listModuleDefinitions() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("module_definitions")
    .select("id, name, description, version, dependencies, is_core, sort_order")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new AppError("INTERNAL", "Unable to load module definitions.", 500);
  }
  return data ?? [];
}

export async function listOrganizationModules() {
  const context = await requirePermission("organization.read");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organization_modules")
    .select("id, module_id, status, enabled_at, settings")
    .eq("organization_id", context.organizationId);

  if (error) {
    throw new AppError("INTERNAL", "Unable to load organization modules.", 500);
  }
  return data ?? [];
}

export async function getOrganizationBranding() {
  const context = await requirePermission("organization.read");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organizations")
    .select(
      "id, name, display_name, timezone, logo_path, date_format, currency_code, contact_email, contact_phone, contact_address",
    )
    .eq("id", context.organizationId)
    .single();

  if (error || !data) {
    throw new AppError("INTERNAL", "Unable to load organization branding.", 500);
  }
  return data;
}
