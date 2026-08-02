"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  applyStarterConfigurationAction,
  commitCsvImportAction,
  completeOnboardingAction,
  createInvitationAction,
  markCatalogStepCompleteAction,
  saveModulesAction,
  saveOnboardingDetailsAction,
  savePrimaryLocationAction,
  setOnboardingStepAction,
  skipCatalogStepAction,
  skipInviteStepAction,
  uploadOrganizationLogoAction,
  validateCsvImportAction,
} from "@/modules/onboarding/commands";
import { ITEM_CSV_TEMPLATE } from "@/modules/onboarding/csv";
import { STARTER_DEFINITIONS } from "@/modules/onboarding/starters";
import type {
  ChecklistItem,
  InvitationListItem,
  OnboardingState,
  OnboardingStep,
  StarterPack,
} from "@/modules/onboarding/types";

type RoleOption = { id: string; name: string; key: string };
type LocationOption = { id: string; name: string; code: string | null };
type ModuleOption = {
  id: string;
  name: string;
  description: string | null;
  is_core: boolean;
  dependencies: string[];
};
type OrgBranding = {
  name: string;
  display_name: string | null;
  timezone: string;
  date_format: string;
  currency_code: string;
  contact_email: string | null;
  contact_phone: string | null;
  contact_address: string | null;
  logo_path: string | null;
};

const STEP_LABELS: Record<OnboardingStep, string> = {
  details: "Organization",
  location: "Location",
  invite: "Team",
  starter: "Starter",
  catalog: "Items",
  modules: "Modules",
  review: "Finish",
};

export function OnboardingWizard({
  state,
  checklist,
  branding,
  logoUrl,
  locations,
  roles,
  invitations,
  modules,
  enabledModuleIds,
  canManageMembers,
  canManageCatalog,
  initialStep,
}: {
  state: OnboardingState;
  checklist: ChecklistItem[];
  branding: OrgBranding;
  logoUrl: string | null;
  locations: LocationOption[];
  roles: RoleOption[];
  invitations: InvitationListItem[];
  modules: ModuleOption[];
  enabledModuleIds: string[];
  canManageMembers: boolean;
  canManageCatalog: boolean;
  initialStep: OnboardingStep;
}) {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [csvText, setCsvText] = useState(ITEM_CSV_TEMPLATE);
  const [csvPreview, setCsvPreview] = useState<{
    batchId: string;
    validCount: number;
    errorCount: number;
    errors: Array<{ rowNumber: number; message: string }>;
  } | null>(null);
  const [selectedModules, setSelectedModules] = useState<string[]>(enabledModuleIds);
  const [starterPack, setStarterPack] = useState<StarterPack>(state.starterPack ?? "clinic");
  const [demoData, setDemoData] = useState(state.demoDataEnabled);

  const primary = locations[0] ?? null;

  const progress = useMemo(() => {
    const done = checklist.filter((c) => c.done).length;
    return Math.round((done / checklist.length) * 100);
  }, [checklist]);

  function goTo(next: OnboardingStep) {
    setError(null);
    setMessage(null);
    setStep(next);
    startTransition(async () => {
      await setOnboardingStepAction({ step: next });
      router.replace(`/onboarding?step=${next}`);
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Setup</p>
        <h1 className="text-3xl font-semibold tracking-tight">Organization onboarding</h1>
        <p className="max-w-2xl text-muted">
          Get this workspace ready for inventory operations. You can leave and resume anytime.
          Optional steps can be skipped.
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
          <div
            className="h-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            role="progressbar"
          />
        </div>
        <nav aria-label="Onboarding steps" className="flex flex-wrap gap-2">
          {(Object.keys(STEP_LABELS) as OnboardingStep[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => goTo(key)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                step === key
                  ? "bg-accent text-background"
                  : "border border-border bg-surface text-muted hover:text-foreground"
              }`}
            >
              {STEP_LABELS[key]}
            </button>
          ))}
        </nav>
      </header>

      {error ? (
        <p className="border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="border border-success/40 bg-success/10 px-3 py-2 text-sm text-success" role="status">
          {message}
        </p>
      ) : null}

      {step === "details" ? (
        <section className="space-y-4 border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold">Organization details</h2>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setError(null);
              startTransition(async () => {
                const result = await saveOnboardingDetailsAction({
                  displayName: String(form.get("displayName") ?? ""),
                  timezone: String(form.get("timezone") ?? ""),
                  dateFormat: String(form.get("dateFormat") ?? "MM/dd/yyyy"),
                  currencyCode: String(form.get("currencyCode") ?? "USD"),
                  contactEmail: String(form.get("contactEmail") ?? ""),
                  contactPhone: String(form.get("contactPhone") ?? ""),
                  contactAddress: String(form.get("contactAddress") ?? ""),
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                const logo = form.get("logo");
                if (logo instanceof File && logo.size > 0) {
                  const logoData = new FormData();
                  logoData.set("file", logo);
                  const logoResult = await uploadOrganizationLogoAction(logoData);
                  if (!logoResult.ok) {
                    setError(logoResult.error);
                    return;
                  }
                }
                setMessage("Organization details saved.");
                goTo("location");
                router.refresh();
              });
            }}
          >
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-sm text-muted">Display name</span>
              <input
                name="displayName"
                required
                defaultValue={branding.display_name ?? branding.name}
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted">Timezone</span>
              <input
                name="timezone"
                required
                defaultValue={branding.timezone}
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted">Date format</span>
              <select
                name="dateFormat"
                defaultValue={branding.date_format}
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="MM/dd/yyyy">MM/dd/yyyy</option>
                <option value="dd/MM/yyyy">dd/MM/yyyy</option>
                <option value="yyyy-MM-dd">yyyy-MM-dd</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted">Currency</span>
              <input
                name="currencyCode"
                required
                defaultValue={branding.currency_code}
                maxLength={3}
                className="w-full border border-border bg-background px-3 py-2 text-sm uppercase"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted">Contact email</span>
              <input
                name="contactEmail"
                type="email"
                defaultValue={branding.contact_email ?? ""}
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted">Contact phone</span>
              <input
                name="contactPhone"
                defaultValue={branding.contact_phone ?? ""}
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-sm text-muted">Contact address</span>
              <textarea
                name="contactAddress"
                rows={2}
                defaultValue={branding.contact_address ?? ""}
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-sm text-muted">Logo (PNG, JPEG, or WebP, max 2MB)</span>
              <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Organization logo" className="mt-2 h-16 w-auto" />
              ) : null}
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={pending}>
                Save and continue
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {step === "location" ? (
        <section className="space-y-4 border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold">Primary location</h2>
          <p className="text-sm text-muted">
            Confirm or update the primary site where inventory will be tracked.
          </p>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setError(null);
              startTransition(async () => {
                const result = await savePrimaryLocationAction({
                  locationId: primary?.id,
                  name: String(form.get("name") ?? ""),
                  code: String(form.get("code") ?? "PRIMARY"),
                  timezone: String(form.get("timezone") ?? "") || null,
                  addressLine1: String(form.get("addressLine1") ?? "") || null,
                  city: String(form.get("city") ?? "") || null,
                  stateRegion: String(form.get("stateRegion") ?? "") || null,
                  postalCode: String(form.get("postalCode") ?? "") || null,
                  countryCode: String(form.get("countryCode") ?? "") || null,
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setMessage("Primary location saved.");
                goTo("invite");
                router.refresh();
              });
            }}
          >
            <label className="block space-y-1">
              <span className="text-sm text-muted">Name</span>
              <input
                name="name"
                required
                defaultValue={primary?.name ?? "Primary"}
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted">Code</span>
              <input
                name="code"
                required
                defaultValue={primary?.code ?? "PRIMARY"}
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted">Timezone</span>
              <input
                name="timezone"
                defaultValue={branding.timezone}
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted">Country</span>
              <input
                name="countryCode"
                defaultValue="US"
                maxLength={2}
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-sm text-muted">Address</span>
              <input
                name="addressLine1"
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted">City</span>
              <input name="city" className="w-full border border-border bg-background px-3 py-2 text-sm" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted">State / region</span>
              <input
                name="stateRegion"
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted">Postal code</span>
              <input
                name="postalCode"
                className="w-full border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" disabled={pending}>
                Save and continue
              </Button>
              <Button type="button" variant="ghost" href="/onboarding?step=details">
                Back
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {step === "invite" ? (
        <section className="space-y-4 border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold">Invite your team</h2>
          <p className="text-sm text-muted">
            Optional. Create pending invitations with role and location access. Production email
            delivery is not wired yet — copy the local accept link after creating an invite.
          </p>
          {canManageMembers ? (
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                setError(null);
                setInviteLink(null);
                startTransition(async () => {
                  const mode = String(form.get("locationAccessMode") ?? "all") as
                    | "all"
                    | "restricted";
                  const locationIds = form.getAll("locationIds").map(String);
                  const result = await createInvitationAction({
                    email: String(form.get("email") ?? ""),
                    roleId: String(form.get("roleId") ?? ""),
                    locationAccessMode: mode,
                    locationIds,
                  });
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setInviteLink(result.data.acceptPath);
                  setMessage("Invitation created. Share the accept link with the teammate.");
                  router.refresh();
                });
              }}
            >
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-sm text-muted">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  className="w-full border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-muted">Role</span>
                <select
                  name="roleId"
                  required
                  className="w-full border border-border bg-background px-3 py-2 text-sm"
                  defaultValue={roles.find((r) => r.key === "staff")?.id ?? roles[0]?.id}
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-muted">Location access</span>
                <select
                  name="locationAccessMode"
                  defaultValue="all"
                  className="w-full border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="all">All locations</option>
                  <option value="restricted">Restricted</option>
                </select>
              </label>
              <fieldset className="sm:col-span-2">
                <legend className="text-sm text-muted">Locations (for restricted access)</legend>
                <div className="mt-2 flex flex-wrap gap-3">
                  {locations.map((location) => (
                    <label key={location.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="locationIds" value={location.id} />
                      {location.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button type="submit" disabled={pending}>
                  Create invitation
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const result = await skipInviteStepAction();
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      goTo("starter");
                      router.refresh();
                    });
                  }}
                >
                  Skip for now
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted">You need members.manage to send invitations.</p>
          )}
          {inviteLink ? (
            <p className="break-all text-sm">
              Accept link: <code className="text-accent">{inviteLink}</code>
            </p>
          ) : null}
          {invitations.length > 0 ? (
            <ul className="divide-y divide-border border border-border">
              {invitations.map((invite) => (
                <li key={invite.id} className="px-3 py-2 text-sm">
                  {invite.email} · {invite.roleName} · {invite.status}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {step === "starter" ? (
        <section className="space-y-4 border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold">Starter configuration</h2>
          <p className="text-sm text-muted">
            Seed reference data only (units, categories, suggested storage). Inventory balances are
            not created unless you enable demo catalog items.
          </p>
          <div className="grid gap-3">
            {(Object.keys(STARTER_DEFINITIONS) as StarterPack[]).map((id) => {
              const pack = STARTER_DEFINITIONS[id];
              return (
                <label
                  key={id}
                  className={`flex cursor-pointer gap-3 border px-3 py-3 ${
                    starterPack === id ? "border-accent bg-accent-muted" : "border-border"
                  }`}
                >
                  <input
                    type="radio"
                    name="starter"
                    checked={starterPack === id}
                    onChange={() => setStarterPack(id)}
                  />
                  <span>
                    <span className="block font-medium">{pack.label}</span>
                    <span className="block text-sm text-muted">{pack.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={demoData}
              onChange={(event) => setDemoData(event.target.checked)}
            />
            Include optional demo catalog items (no stock quantities)
          </label>
          <Button
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await applyStarterConfigurationAction({
                  starterPack,
                  demoDataEnabled: demoData,
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setMessage(
                  `Starter applied (${result.data.unitsCreated} units, ${result.data.categoriesCreated} categories).`,
                );
                goTo("catalog");
                router.refresh();
              });
            }}
          >
            Apply starter and continue
          </Button>
        </section>
      ) : null}

      {step === "catalog" ? (
        <section className="space-y-4 border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold">Import or create items</h2>
          <p className="text-sm text-muted">
            Optional. CSV import is all-or-nothing after a successful dry-run validation. Quantities
            are not imported — use opening balances later.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(ITEM_CSV_TEMPLATE)}`}
            >
              Download template
            </Button>
            <Button variant="secondary" href="/administration/catalog/items/new">
              Create item manually
            </Button>
          </div>
          {canManageCatalog ? (
            <>
              <label className="block space-y-1">
                <span className="text-sm text-muted">CSV content</span>
                <textarea
                  value={csvText}
                  onChange={(event) => setCsvText(event.target.value)}
                  rows={8}
                  className="w-full border border-border bg-background px-3 py-2 font-mono text-xs"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const result = await validateCsvImportAction({
                        csvText,
                        fileName: "items.csv",
                      });
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      setCsvPreview(result.data);
                      setMessage(
                        result.data.errorCount === 0
                          ? `Validation passed for ${result.data.validCount} rows.`
                          : `Validation found ${result.data.errorCount} error(s).`,
                      );
                    });
                  }}
                >
                  Validate (dry run)
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending || !csvPreview || csvPreview.errorCount > 0}
                  onClick={() => {
                    if (!csvPreview) return;
                    setError(null);
                    startTransition(async () => {
                      const result = await commitCsvImportAction({ batchId: csvPreview.batchId });
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      setMessage(`Imported ${result.data.committedCount} items.`);
                      goTo("modules");
                      router.refresh();
                    });
                  }}
                >
                  Commit import
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await skipCatalogStepAction();
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      goTo("modules");
                      router.refresh();
                    });
                  }}
                >
                  Skip for now
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      await markCatalogStepCompleteAction();
                      goTo("modules");
                      router.refresh();
                    });
                  }}
                >
                  Continue without import
                </Button>
              </div>
              {csvPreview?.errors.length ? (
                <ul className="space-y-1 text-sm text-danger">
                  {csvPreview.errors.slice(0, 10).map((err, index) => (
                    <li key={`${err.rowNumber}-${index}`}>
                      Row {err.rowNumber}: {err.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted">You need catalog.manage to import items.</p>
          )}
        </section>
      ) : null}

      {step === "modules" ? (
        <section className="space-y-4 border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold">Modules</h2>
          <p className="text-sm text-muted">
            Enable starter modules for this organization. This is configuration groundwork only —
            billing enforcement is not included.
          </p>
          <ul className="space-y-3">
            {modules.map((mod) => {
              const checked = selectedModules.includes(mod.id);
              return (
                <li key={mod.id}>
                  <label className="flex items-start gap-3 border border-border px-3 py-3">
                    <input
                      type="checkbox"
                      checked={checked || mod.is_core}
                      disabled={mod.is_core}
                      onChange={(event) => {
                        setSelectedModules((current) => {
                          if (event.target.checked) return [...new Set([...current, mod.id])];
                          return current.filter((id) => id !== mod.id);
                        });
                      }}
                    />
                    <span>
                      <span className="block font-medium">
                        {mod.name}
                        {mod.is_core ? " (required)" : ""}
                      </span>
                      <span className="block text-sm text-muted">{mod.description}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <Button
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await saveModulesAction({ enabledModuleIds: selectedModules });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setMessage("Modules saved.");
                goTo("review");
                router.refresh();
              });
            }}
          >
            Save modules and continue
          </Button>
        </section>
      ) : null}

      {step === "review" ? (
        <section className="space-y-4 border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold">Review and finish</h2>
          <ul className="space-y-2">
            {checklist.map((item) => (
              <li key={item.key} className="flex items-center justify-between text-sm">
                <span>
                  {item.label}
                  {!item.required ? " (optional)" : ""}
                </span>
                <span className={item.done ? "text-success" : "text-warning"}>
                  {item.done ? (item.skipped ? "Skipped" : "Done") : "Incomplete"}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending || state.status === "completed"}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await completeOnboardingAction();
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setMessage("Onboarding complete.");
                  router.replace("/dashboard");
                  router.refresh();
                });
              }}
            >
              Finish setup
            </Button>
            <Button variant="secondary" href="/dashboard">
              Return to dashboard
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
