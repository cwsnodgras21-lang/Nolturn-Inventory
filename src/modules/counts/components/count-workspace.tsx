"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  addCountLineAction,
  approveCountSessionAction,
  cancelCountSessionAction,
  createCountSessionAction,
  recordCountLineAction,
  returnCountSessionAction,
  reviewCountLineAction,
  startCountSessionAction,
  submitCountSessionAction,
} from "@/modules/counts/commands";
import type { CountLine, CountSession } from "@/modules/counts/types";
import type { CatalogItem, ItemVariant, UnitOfMeasure } from "@/modules/catalog/types";
import type { StorageArea, StorageBin } from "@/modules/storage/types";

type LocationOption = { id: string; name: string };

export function CreateCountForm({
  locations,
  canCreate,
}: {
  locations: LocationOption[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [blind, setBlind] = useState(false);
  const [selectedLocations, setSelectedLocations] = useState<string[]>(
    locations[0] ? [locations[0].id] : [],
  );

  function toggleLocation(id: string) {
    setSelectedLocations((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  return (
    <form
      className="grid max-w-xl gap-4 border border-border bg-surface p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || !canCreate) return;
        setMessage(null);
        startTransition(async () => {
          const result = await createCountSessionAction({
            name,
            notes: notes.trim() ? notes : null,
            blindCountEnabled: blind,
            locationIds: selectedLocations,
          });
          if (!result.ok) {
            setMessage(result.error);
            return;
          }
          router.push(`/inventory/counts/${result.data.id}`);
          router.refresh();
        });
      }}
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">New count</h2>
        <p className="text-sm text-muted">
          Assign locations, optionally enable blind count, then start to freeze expected quantities.
        </p>
      </div>
      <label className="space-y-1 text-sm">
        <span className="text-muted">Name</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
        />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm text-muted">Locations</legend>
        <div className="grid gap-2">
          {locations.map((location) => (
            <label
              key={location.id}
              className="flex min-h-12 items-center gap-3 border border-border px-3 py-2 text-base"
            >
              <input
                type="checkbox"
                checked={selectedLocations.includes(location.id)}
                onChange={() => toggleLocation(location.id)}
                className="size-5"
              />
              {location.name}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex min-h-12 items-center gap-3 text-base">
        <input
          type="checkbox"
          checked={blind}
          onChange={(e) => setBlind(e.target.checked)}
          className="size-5"
        />
        Blind count (hide expected quantities from counters)
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      {message ? <p className="text-sm text-accent">{message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={pending || !canCreate || !name.trim() || selectedLocations.length === 0}
        >
          {pending ? "Creating…" : "Create draft"}
        </Button>
        <Button href="/inventory/counts" variant="ghost">
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function CountWorkspace({
  session,
  lines,
  items,
  variants,
  units,
  locations,
  areas,
  bins,
  canPerform,
  canReview,
  revealExpected,
}: {
  session: CountSession;
  lines: CountLine[];
  items: CatalogItem[];
  variants: ItemVariant[];
  units: UnitOfMeasure[];
  locations: LocationOption[];
  areas: StorageArea[];
  bins: StorageBin[];
  canPerform: boolean;
  canReview: boolean;
  revealExpected: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const line of lines) {
      initial[line.id] =
        line.countedQuantity === null || line.countedQuantity === undefined
          ? ""
          : String(line.countedQuantity);
    }
    return initial;
  });

  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [variantId, setVariantId] = useState("");
  const [locationId, setLocationId] = useState(session.locationIds?.[0] ?? locations[0]?.id ?? "");
  const [areaId, setAreaId] = useState("");
  const [binId, setBinId] = useState("");
  const [newCounted, setNewCounted] = useState("0");

  const itemVariants = useMemo(
    () => variants.filter((variant) => variant.itemId === itemId),
    [variants, itemId],
  );
  const locationAreas = useMemo(
    () => areas.filter((area) => area.locationId === locationId),
    [areas, locationId],
  );
  const effectiveAreaId = locationAreas.some((area) => area.id === areaId)
    ? areaId
    : (locationAreas[0]?.id ?? "");
  const areaBins = useMemo(
    () => bins.filter((bin) => bin.storageAreaId === effectiveAreaId),
    [bins, effectiveAreaId],
  );
  const effectiveBinId = areaBins.some((bin) => bin.id === binId) ? binId : "";

  const unreviewed = lines.filter((line) => line.status === "counted").length;
  const pendingLines = lines.filter(
    (line) => line.countedQuantity === null || line.status === "pending",
  ).length;

  function refresh() {
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">{session.name}</h2>
        <p className="text-sm capitalize text-muted">
          {session.status.replaceAll("_", " ")}
          {session.blindCountEnabled ? " · Blind count" : ""}
        </p>
        {session.locationNames?.length ? (
          <p className="text-sm text-muted">Locations: {session.locationNames.join(", ")}</p>
        ) : null}
        {session.notes ? <p className="text-sm">{session.notes}</p> : null}
        {!revealExpected && session.status === "in_progress" ? (
          <p className="text-sm text-accent">Expected quantities are hidden for this blind count.</p>
        ) : null}
      </div>

      {message ? <p className="text-sm text-accent">{message}</p> : null}

      <div className="flex flex-wrap gap-2">
        {canPerform && session.status === "draft" ? (
          <>
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                setMessage(null);
                startTransition(async () => {
                  const result = await startCountSessionAction(session.id);
                  if (!result.ok) {
                    setMessage(result.error);
                    return;
                  }
                  refresh();
                });
              }}
            >
              Start count
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setMessage(null);
                startTransition(async () => {
                  const result = await cancelCountSessionAction(session.id);
                  if (!result.ok) {
                    setMessage(result.error);
                    return;
                  }
                  refresh();
                });
              }}
            >
              Cancel
            </Button>
          </>
        ) : null}

        {canPerform && session.status === "in_progress" ? (
          <>
            <Button
              type="button"
              disabled={pending || pendingLines > 0 || lines.length === 0}
              onClick={() => {
                setMessage(null);
                startTransition(async () => {
                  const result = await submitCountSessionAction(session.id);
                  if (!result.ok) {
                    setMessage(result.error);
                    return;
                  }
                  refresh();
                });
              }}
            >
              Submit for review
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setMessage(null);
                startTransition(async () => {
                  const result = await cancelCountSessionAction(session.id);
                  if (!result.ok) {
                    setMessage(result.error);
                    return;
                  }
                  refresh();
                });
              }}
            >
              Cancel
            </Button>
          </>
        ) : null}

        {canReview && session.status === "ready_for_review" ? (
          <>
            <Button
              type="button"
              disabled={pending || unreviewed > 0}
              onClick={() => {
                setMessage(null);
                startTransition(async () => {
                  const result = await approveCountSessionAction(session.id);
                  if (!result.ok) {
                    setMessage(result.error);
                    return;
                  }
                  setMessage("Reconciliation approved. Adjustments posted to the ledger.");
                  refresh();
                });
              }}
            >
              Approve reconciliation
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setMessage(null);
                startTransition(async () => {
                  const result = await returnCountSessionAction(session.id);
                  if (!result.ok) {
                    setMessage(result.error);
                    return;
                  }
                  refresh();
                });
              }}
            >
              Return for correction
            </Button>
          </>
        ) : null}
      </div>

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-surface text-muted">
            <tr>
              <th className="px-3 py-3 font-medium">Item</th>
              <th className="px-3 py-3 font-medium">Storage</th>
              {revealExpected ? <th className="px-3 py-3 font-medium">Expected</th> : null}
              <th className="px-3 py-3 font-medium">Counted</th>
              {revealExpected ? <th className="px-3 py-3 font-medium">Variance</th> : null}
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-border/70">
                <td className="px-3 py-3">
                  <div className="font-medium">{line.itemName}</div>
                  <div className="text-xs text-muted">
                    {line.itemSku}
                    {line.variantName ? ` · ${line.variantName}` : ""}
                  </div>
                </td>
                <td className="px-3 py-3 text-muted">
                  {line.locationName} / {line.storageAreaName}
                  {line.binName ? ` / ${line.binName}` : ""}
                </td>
                {revealExpected ? (
                  <td className="px-3 py-3">
                    {line.expectedQuantity} {line.baseUnitSymbol}
                  </td>
                ) : null}
                <td className="px-3 py-3">
                  {canPerform && session.status === "in_progress" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={quantities[line.id] ?? ""}
                        onChange={(e) =>
                          setQuantities((current) => ({ ...current, [line.id]: e.target.value }))
                        }
                        className="w-28 rounded-md border border-border bg-background px-3 py-3 text-base"
                      />
                      <Button
                        type="button"
                        disabled={pending || quantities[line.id] === ""}
                        onClick={() => {
                          setMessage(null);
                          startTransition(async () => {
                            const result = await recordCountLineAction(session.id, line.id, {
                              countedQuantity: Number(quantities[line.id]),
                            });
                            if (!result.ok) {
                              setMessage(result.error);
                              return;
                            }
                            refresh();
                          });
                        }}
                      >
                        Save
                      </Button>
                    </div>
                  ) : (
                    <span>
                      {line.countedQuantity ?? "—"} {line.baseUnitSymbol}
                    </span>
                  )}
                </td>
                {revealExpected ? (
                  <td className="px-3 py-3">
                    {line.variance === null ? "—" : `${line.variance} ${line.baseUnitSymbol ?? ""}`}
                  </td>
                ) : null}
                <td className="px-3 py-3 capitalize">{line.status}</td>
                <td className="px-3 py-3 text-right">
                  {canReview && session.status === "ready_for_review" && line.status === "counted" ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setMessage(null);
                          startTransition(async () => {
                            const result = await reviewCountLineAction(session.id, line.id, {
                              decision: "accepted",
                            });
                            if (!result.ok) {
                              setMessage(result.error);
                              return;
                            }
                            refresh();
                          });
                        }}
                      >
                        Accept
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => {
                          setMessage(null);
                          startTransition(async () => {
                            const result = await reviewCountLineAction(session.id, line.id, {
                              decision: "rejected",
                            });
                            if (!result.ok) {
                              setMessage(result.error);
                              return;
                            }
                            refresh();
                          });
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : null}
                  {line.reconciliationTransactionId ? (
                    <Link
                      href={`/inventory/transactions/${line.reconciliationTransactionId}`}
                      className="text-xs underline underline-offset-2"
                    >
                      Adjustment
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
            {lines.length === 0 ? (
              <tr>
                <td
                  colSpan={revealExpected ? 7 : 5}
                  className="px-3 py-8 text-center text-muted"
                >
                  {session.status === "draft"
                    ? "Start the count to freeze expected quantities from current balances."
                    : "No count lines yet. Add an item below if stock was missing from the snapshot."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {canPerform && session.status === "in_progress" ? (
        <form
          className="grid gap-3 border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (pending || !effectiveAreaId) return;
            setMessage(null);
            startTransition(async () => {
              const result = await addCountLineAction(session.id, {
                itemId,
                variantId: variantId || null,
                locationId,
                storageAreaId: effectiveAreaId,
                binId: effectiveBinId || null,
                countedQuantity: Number(newCounted),
              });
              if (!result.ok) {
                setMessage(result.error);
                return;
              }
              setNewCounted("0");
              refresh();
            });
          }}
        >
          <div className="space-y-1 sm:col-span-2 lg:col-span-3">
            <h3 className="text-base font-semibold">Add missing item</h3>
            <p className="text-sm text-muted">
              Use when an item exists physically but had no on-hand balance at start (expected = 0).
            </p>
          </div>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Item</span>
            <select
              value={itemId}
              onChange={(e) => {
                setItemId(e.target.value);
                setVariantId("");
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
            >
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {itemVariants.length > 0 ? (
            <label className="space-y-1 text-sm">
              <span className="text-muted">Variant</span>
              <select
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
              >
                <option value="">Select variant</option>
                {itemVariants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="space-y-1 text-sm">
            <span className="text-muted">Location</span>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
            >
              {(session.locationIds ?? [])
                .map((id) => locations.find((location) => location.id === id))
                .filter(Boolean)
                .map((location) => (
                  <option key={location!.id} value={location!.id}>
                    {location!.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Storage area</span>
            <select
              value={effectiveAreaId}
              onChange={(e) => setAreaId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
            >
              {locationAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Bin (optional)</span>
            <select
              value={effectiveBinId}
              onChange={(e) => setBinId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
            >
              <option value="">None</option>
              {areaBins.map((bin) => (
                <option key={bin.id} value={bin.id}>
                  {bin.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Counted qty</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={newCounted}
              onChange={(e) => setNewCounted(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
            />
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={pending || !effectiveAreaId || !units.length}>
              Add line
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
