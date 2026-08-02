import type { ChecklistItem, OnboardingState } from "@/modules/onboarding/types";

export function buildOnboardingChecklist(state: OnboardingState): ChecklistItem[] {
  return [
    {
      key: "details",
      label: "Organization details",
      required: true,
      done: Boolean(state.detailsCompletedAt),
      href: "/onboarding?step=details",
    },
    {
      key: "location",
      label: "Primary location",
      required: true,
      done: Boolean(state.locationCompletedAt),
      href: "/onboarding?step=location",
    },
    {
      key: "invite",
      label: "Invite teammates",
      required: false,
      done: Boolean(state.inviteCompletedAt) || state.inviteSkipped,
      skipped: state.inviteSkipped && !state.inviteCompletedAt,
      href: "/onboarding?step=invite",
    },
    {
      key: "starter",
      label: "Starter configuration",
      required: true,
      done: Boolean(state.starterCompletedAt),
      href: "/onboarding?step=starter",
    },
    {
      key: "catalog",
      label: "Import or create items",
      required: false,
      done: Boolean(state.catalogCompletedAt) || state.catalogSkipped,
      skipped: state.catalogSkipped && !state.catalogCompletedAt,
      href: "/onboarding?step=catalog",
    },
    {
      key: "modules",
      label: "Enable modules",
      required: true,
      done: Boolean(state.modulesCompletedAt),
      href: "/onboarding?step=modules",
    },
    {
      key: "review",
      label: "Review and finish",
      required: true,
      done: state.status === "completed",
      href: "/onboarding?step=review",
    },
  ];
}

export function requiredStepsComplete(state: OnboardingState): boolean {
  return Boolean(
    state.detailsCompletedAt &&
      state.locationCompletedAt &&
      state.starterCompletedAt &&
      state.modulesCompletedAt,
  );
}

export function onboardingProgressPercent(state: OnboardingState): number {
  const items = buildOnboardingChecklist(state);
  const done = items.filter((i) => i.done).length;
  return Math.round((done / items.length) * 100);
}
