export const ONBOARDING_STEPS = [
  "details",
  "location",
  "invite",
  "starter",
  "catalog",
  "modules",
  "review",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const STARTER_PACKS = ["blank", "clinic", "dental", "medspa"] as const;
export type StarterPack = (typeof STARTER_PACKS)[number];

export const DATE_FORMATS = ["MM/dd/yyyy", "dd/MM/yyyy", "yyyy-MM-dd"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export type OnboardingStatus = "not_started" | "in_progress" | "completed";

export type ChecklistItem = {
  key: string;
  label: string;
  required: boolean;
  done: boolean;
  skipped?: boolean;
  href?: string;
};

export type OnboardingState = {
  organizationId: string;
  status: OnboardingStatus;
  currentStep: OnboardingStep;
  starterPack: StarterPack | null;
  demoDataEnabled: boolean;
  detailsCompletedAt: string | null;
  locationCompletedAt: string | null;
  inviteCompletedAt: string | null;
  inviteSkipped: boolean;
  starterCompletedAt: string | null;
  catalogCompletedAt: string | null;
  catalogSkipped: boolean;
  modulesCompletedAt: string | null;
  completedAt: string | null;
};

export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export type InvitationListItem = {
  id: string;
  email: string;
  status: InvitationStatus;
  roleId: string;
  roleName: string;
  locationAccessMode: "all" | "restricted";
  expiresAt: string;
  createdAt: string;
};

export type CsvItemRow = {
  rowNumber: number;
  name: string;
  sku: string;
  baseUnit: string;
  entryUnit: string;
  category: string | null;
  description: string | null;
};

export type CsvRowIssue = {
  rowNumber: number;
  field?: string;
  message: string;
};

export type CsvValidationResult = {
  rows: CsvItemRow[];
  errors: CsvRowIssue[];
  warnings: CsvRowIssue[];
  validCount: number;
  errorCount: number;
};
