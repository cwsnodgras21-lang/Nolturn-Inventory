import { describe, expect, it } from "vitest";
import {
  buildOnboardingChecklist,
  requiredStepsComplete,
} from "@/modules/onboarding/checklist";
import type { OnboardingState } from "@/modules/onboarding/types";

function baseState(overrides: Partial<OnboardingState> = {}): OnboardingState {
  return {
    organizationId: "00000000-0000-0000-0000-000000000001",
    status: "in_progress",
    currentStep: "details",
    starterPack: null,
    demoDataEnabled: false,
    detailsCompletedAt: null,
    locationCompletedAt: null,
    inviteCompletedAt: null,
    inviteSkipped: false,
    starterCompletedAt: null,
    catalogCompletedAt: null,
    catalogSkipped: false,
    modulesCompletedAt: null,
    completedAt: null,
    ...overrides,
  };
}

describe("onboarding checklist", () => {
  it("treats invite and catalog skips as done without completing required steps", () => {
    const state = baseState({
      inviteSkipped: true,
      catalogSkipped: true,
    });
    const checklist = buildOnboardingChecklist(state);
    expect(checklist.find((i) => i.key === "invite")?.done).toBe(true);
    expect(checklist.find((i) => i.key === "catalog")?.done).toBe(true);
    expect(requiredStepsComplete(state)).toBe(false);
  });

  it("requires details, location, starter, and modules before completion", () => {
    const incomplete = baseState({
      detailsCompletedAt: "2026-08-02T00:00:00Z",
      locationCompletedAt: "2026-08-02T00:00:00Z",
      starterCompletedAt: "2026-08-02T00:00:00Z",
    });
    expect(requiredStepsComplete(incomplete)).toBe(false);

    const complete = baseState({
      detailsCompletedAt: "2026-08-02T00:00:00Z",
      locationCompletedAt: "2026-08-02T00:00:00Z",
      starterCompletedAt: "2026-08-02T00:00:00Z",
      modulesCompletedAt: "2026-08-02T00:00:00Z",
      inviteSkipped: true,
      catalogSkipped: true,
    });
    expect(requiredStepsComplete(complete)).toBe(true);
  });
});
