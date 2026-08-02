"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  addAdjustmentLineAction,
  cancelAdjustmentAction,
  completeAdjustmentAction,
  createAdjustmentAction,
  removeAdjustmentLineAction,
} from "@/modules/inventory/commands";
import type { InventoryTransaction, InventoryTransactionLine } from "@/modules/inventory/types";
import type { CatalogItem, ItemVariant, UnitOfMeasure } from "@/modules/catalog/types";
import type { StorageArea, StorageBin } from "@/modules/storage/types";

type LocationOption = { id: string; name: string };

export function NewAdjustmentForm({
  items,
  units,
  locations,
}: {
  items: CatalogItem[];
  units: UnitOfMeasure[];
  locations: LocationOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [transactionType, setTransactionType] = useState<
    "opening_balance" | "positive_adjustment"
  >("opening_balance");
  const [notes, setNotes] = useState("");

  return (
    <form
      className="grid max-w-xl gap-4 border border-border bg-surface p-5"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await createAdjustmentAction({
            transactionType,
            notes: notes.trim() ? notes : null,
          });
          if (!result.ok) {
            setMessage(result.error);
            return;
          }
          router.push(`/inventory/transactions/${result.data.id}`);
          router.refresh();
        });
      }}
    >
      <label className="space-y-1 text-sm">
        <span className="text-muted">Type</span>
        <select
          value={transactionType}
          onChange={(e) =>
            setTransactionType(e.target.value as "opening_balance" | "positive_adjustment")
          }
          className="w-full rounded-md border border-border bg-background px-3 py-2"
        >
          <option value="opening_balance">Opening balance</option>
          <option value="positive_adjustment">Positive adjustment</option>
        </select>
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
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || items.length === 0 || locations.length === 0}>
          Create draft
        </Button>
        <Button href="/inventory/transactions" variant="ghost">
          Cancel
        </Button>
      </div>
      {items.length === 0 || locations.length === 0 ? (
        <p className="text-sm text-muted">
          Catalog items and accessible locations are required before creating an adjustment.
        </p>
      ) : null}
      <p className="text-xs text-muted">
        Available units: {units.length}. Add lines on the next screen before completing.
      </p>
    </form>
  );
}

export function TransactionDetailPanel({
  transaction,
  lines,
  items,
  variants,
  units,
  locations,
  areas,
  bins,
  canAdjust,
}: {
  transaction: InventoryTransaction;
  lines: InventoryTransactionLine[];
  items: CatalogItem[];
  variants: ItemVariant[];
  units: UnitOfMeasure[];
  locations: LocationOption[];
  areas: StorageArea[];
  bins: StorageBin[];
  canAdjust: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [variantId, setVariantId] = useState("");
  const [enteredQuantity, setEnteredQuantity] = useState("1");
  const [enteredUnitId, setEnteredUnitId] = useState(
    items[0]?.defaultEntryUnitId ?? units[0]?.id ?? "",
  );
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [areaId, setAreaId] = useState("");
  const [binId, setBinId] = useState("");
  const [lineNotes, setLineNotes] = useState("");

  const selectedItem = items.find((item) => item.id === itemId);
  const itemVariants = useMemo(
    () => variants.filter((variant) => variant.itemId === itemId),
    [variants, itemId],
  );
  const locationAreas = useMemo(
    () => areas.filter((area) => area.locationId === locationId),
    [areas, locationId],
  );
  const areaBins = useMemo(
    () => bins.filter((bin) => bin.storageAreaId === areaId),
    [bins, areaId],
  );

  const isDraft = transaction.status === "draft";

  function refresh() {
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="font-mono text-sm text-muted">{transaction.transactionNumber}</p>
        <p className="text-sm capitalize text-muted">
          {transaction.transactionType.replaceAll("_", " ")} · {transaction.status}
        </p>
        {transaction.notes ? <p className="text-sm">{transaction.notes}</p> : null}
        {transaction.completedAt ? (
          <p className="text-xs text-muted">
            Completed {new Date(transaction.completedAt).toLocaleString()}
          </p>
        ) : null}
      </div>

      {message ? <p className="text-sm text-accent">{message}</p> : null}

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-surface text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Entered</th>
              <th className="px-3 py-2 font-medium">Base</th>
              <th className="px-3 py-2 font-medium">Destination</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-border/70">
                <td className="px-3 py-2">{line.lineNumber}</td>
                <td className="px-3 py-2">
                  <div>{line.itemName}</div>
                  <div className="text-xs text-muted">
                    {line.itemSku}
                    {line.variantName ? ` · ${line.variantName}` : ""}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {line.enteredQuantity} {line.enteredUnitSymbol}
                </td>
                <td className="px-3 py-2">
                  {line.baseQuantity}
                  <span className="ml-1 text-xs text-muted">×{line.conversionMultiplier}</span>
                </td>
                <td className="px-3 py-2 text-muted">
                  {line.destinationLocationName} / {line.destinationStorageAreaName}
                  {line.destinationBinName ? ` / ${line.destinationBinName}` : ""}
                </td>
                <td className="px-3 py-2 text-right">
                  {canAdjust && isDraft ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        setMessage(null);
                        startTransition(async () => {
                          const result = await removeAdjustmentLineAction(transaction.id, line.id);
                          if (!result.ok) {
                            setMessage(result.error);
                            return;
                          }
                          refresh();
                        });
                      }}
                    >
                      Remove
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
            {lines.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted">
                  No lines yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {canAdjust && isDraft ? (
        <>
          <form
            className="grid gap-3 border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              setMessage(null);
              startTransition(async () => {
                const result = await addAdjustmentLineAction(transaction.id, {
                  itemId,
                  variantId: variantId || null,
                  enteredQuantity: Number(enteredQuantity),
                  enteredUnitId,
                  destinationLocationId: locationId,
                  destinationStorageAreaId: areaId,
                  destinationBinId: binId || null,
                  notes: lineNotes.trim() ? lineNotes : null,
                });
                if (!result.ok) {
                  setMessage(result.error);
                  return;
                }
                setLineNotes("");
                setMessage("Line added.");
                refresh();
              });
            }}
          >
            <label className="space-y-1 text-sm">
              <span className="text-muted">Item</span>
              <select
                required
                value={itemId}
                onChange={(e) => {
                  const next = e.target.value;
                  setItemId(next);
                  const nextItem = items.find((item) => item.id === next);
                  setEnteredUnitId(nextItem?.defaultEntryUnitId ?? enteredUnitId);
                  setVariantId("");
                }}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.sku})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted">Variant</span>
              <select
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                required={Boolean(selectedItem?.requiresVariant)}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              >
                <option value="">{selectedItem?.requiresVariant ? "Select variant" : "None"}</option>
                {itemVariants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted">Quantity</span>
              <input
                required
                type="number"
                min="0.000001"
                step="any"
                value={enteredQuantity}
                onChange={(e) => setEnteredQuantity(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted">Unit</span>
              <select
                required
                value={enteredUnitId}
                onChange={(e) => setEnteredUnitId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              >
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name} ({unit.symbol})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted">Location</span>
              <select
                required
                value={locationId}
                onChange={(e) => {
                  setLocationId(e.target.value);
                  setAreaId("");
                  setBinId("");
                }}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              >
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted">Storage area</span>
              <select
                required
                value={areaId}
                onChange={(e) => {
                  setAreaId(e.target.value);
                  setBinId("");
                }}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              >
                <option value="">Select area</option>
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
                value={binId}
                onChange={(e) => setBinId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              >
                <option value="">No bin</option>
                {areaBins.map((bin) => (
                  <option key={bin.id} value={bin.id}>
                    {bin.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm lg:col-span-2">
              <span className="text-muted">Line notes</span>
              <input
                value={lineNotes}
                onChange={(e) => setLineNotes(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </label>
            <Button type="submit" disabled={pending || !areaId}>
              Add line
            </Button>
          </form>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending || lines.length === 0}
              onClick={() => {
                setMessage(null);
                startTransition(async () => {
                  const result = await completeAdjustmentAction(transaction.id);
                  if (!result.ok) {
                    setMessage(result.error);
                    return;
                  }
                  setMessage("Transaction completed.");
                  refresh();
                });
              }}
            >
              Complete
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setMessage(null);
                startTransition(async () => {
                  const result = await cancelAdjustmentAction(transaction.id);
                  if (!result.ok) {
                    setMessage(result.error);
                    return;
                  }
                  refresh();
                });
              }}
            >
              Cancel draft
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
