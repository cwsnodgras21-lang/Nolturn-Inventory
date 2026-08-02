import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { can } from "@/lib/permissions";
import { listOrganizationRoles } from "@/modules/identity";
import { listLocationsForOrganization } from "@/modules/locations";
import { OnboardingWizard } from "@/modules/onboarding/components/onboarding-wizard";
import {
  getOnboardingDashboardSummary,
  getOrganizationBranding,
  getOrganizationLogoSignedUrlAction,
  listModuleDefinitions,
  listOrganizationInvitations,
  listOrganizationModules,
} from "@/modules/onboarding";
import { ONBOARDING_STEPS, type OnboardingStep } from "@/modules/onboarding/types";

export const metadata: Metadata = {
  title: "Onboarding",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { tenant } = await resolvePlatformContext();

  if (!can(tenant, "organization.manage") && !can(tenant, "organization.read")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const summary = await getOnboardingDashboardSummary();
  if (!summary.state) {
    redirect("/dashboard");
  }

  const requested = params.step;
  const step: OnboardingStep =
    requested && (ONBOARDING_STEPS as readonly string[]).includes(requested)
      ? (requested as OnboardingStep)
      : summary.state.currentStep;

  const [branding, logoResult, locations, roles, invitations, modules, orgModules] =
    await Promise.all([
      getOrganizationBranding(),
      getOrganizationLogoSignedUrlAction(),
      listLocationsForOrganization(tenant.organizationId),
      listOrganizationRoles(tenant.organizationId),
      can(tenant, "members.read") ? listOrganizationInvitations() : Promise.resolve([]),
      listModuleDefinitions(),
      listOrganizationModules(),
    ]);

  const enabledModuleIds = orgModules
    .filter((row) => row.status === "enabled")
    .map((row) => row.module_id);

  return (
    <OnboardingWizard
      state={summary.state}
      checklist={summary.checklist}
      branding={branding}
      logoUrl={logoResult.ok ? logoResult.data.url : null}
      locations={locations.map((l) => ({ id: l.id, name: l.name, code: l.code }))}
      roles={roles.map((r) => ({ id: r.id, name: r.name, key: r.key }))}
      invitations={invitations}
      modules={modules}
      enabledModuleIds={enabledModuleIds}
      canManageMembers={can(tenant, "members.manage")}
      canManageCatalog={can(tenant, "catalog.manage")}
      initialStep={step}
    />
  );
}
