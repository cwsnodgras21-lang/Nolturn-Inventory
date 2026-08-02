"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  addInventoryLineAction,
  cancelInventoryTransactionAction,
  completeInventoryTransactionAction,
  createInventoryTransactionAction,
  removeInventoryLineAction,
} from "@/modules/inventory/commands";
import type {
  InventoryTransaction,
  InventoryTransactionLine,
  InventoryTransactionType,
} from "@/modules/inventory/types";
import type { CatalogItem, ItemVariant, UnitOfMeasure } from "@/modules/catalog/types";
import type { StorageArea, StorageBin } from "@/modules/storage/types";

type LocationOption = { id: string; name: string };

const TYPE_LABELS: Record<InventoryTransactionType, string> = {
  opening_balance: "Opening balance",
  positive_adjustment: "Positive adjustment",
  negative_adjustment: "Negative adjustment",
  receipt: "Receive inventory",
  consumption: "Consume inventory",
  transfer: "Transfer inventory",
};

function needsDestination(type: InventoryTransactionType) {
  return (
    type === "opening_balance" ||
    type === "positive_adjustment" ||
    type === "receipt" ||
    type === "transfer"
  );
}

function needsSource(type: InventoryTransactionType) {
  return type === "consumption" || type === "negative_adjustment" || type === "transfer";
}

export function StartMovementForm({
  transactionType,
  title,
  description,
  canStart,
  allowTypeSelect = false,
}: {
  transactionType: InventoryTransactionType;
  title: string;
  description: string;
  canStart: boolean;
  /** When true, user can pick among adjustment types (opening / + / −). */
  allowTypeSelect?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [referenceText, setReferenceText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [selectedType, setSelectedType] = useState(transactionType);

  const activeType = allowTypeSelect ? selectedType : transactionType;

  return (
    <form
      className="grid max-w-xl gap-4 border border-border bg-surface p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || submitted || !canStart) return;
        setMessage(null);
        setSubmitted(true);
        startTransition(async () => {
          const result = await createInventoryTransactionAction({
            transactionType: activeType,
            notes: notes.trim() ? notes : null,
            referenceText: referenceText.trim() ? referenceText : null,
          });
          if (!result.ok) {
            setMessage(result.error);
            setSubmitted(false);
            return;
          }
          router.push(`/inventory/transactions/${result.data.id}`);
          router.refresh();
        });
      }}
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted">{description}</p>
      </div>
      {allowTypeSelect ? (
        <label className="space-y-1 text-sm">
          <span className="text-muted">Adjustment type</span>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as InventoryTransactionType)}
            className="w-full rounded-md border border-border bg-background px-3 py-2"
          >
            <option value="positive_adjustment">Positive adjustment</option>
            <option value="negative_adjustment">Negative adjustment</option>
            <option value="opening_balance">Opening balance</option>
          </select>
        </label>
      ) : null}
      {activeType === "receipt" ? (
        <label className="space-y-1 text-sm">
          <span className="text-muted">Reference (optional)</span>
          <input
            value={referenceText}
            onChange={(e) => setReferenceText(e.target.value)}
            placeholder="Delivery note, packing slip, etc."
            className="w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
      ) : null}
      <label className="space-y-1 text-sm">
        <span className="text-muted">
          {activeType === "negative_adjustment" ? "Reason (required)" : "Notes"}
        </span>
        <textarea
          required={activeType === "negative_adjustment"}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      {message ? <p className="text-sm text-accent">{message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || submitted || !canStart}>
          {pending || submitted ? "Creating…" : "Create draft"}
        </Button>
        <Button href="/inventory/transactions" variant="ghost">
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function TransactionWorkspace({
  transaction,
  lines,
  items,
  variants,
  units,
  locations,
  areas,
  bins,
  canManage,
}: {
  transaction: InventoryTransaction;
  lines: InventoryTransactionLine[];
  items: CatalogItem[];
  variants: ItemVariant[];
  units: UnitOfMeasure[];
  locations: LocationOption[];
  areas: StorageArea[];
  bins: StorageBin[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const type = transaction.transactionType;
  const showDest = needsDestination(type);
  const showSource = needsSource(type);
  const isDraft = transaction.status === "draft";

  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [variantId, setVariantId] = useState("");
  const [enteredQuantity, setEnteredQuantity] = useState("1");
  const [enteredUnitId, setEnteredUnitId] = useState(
    items[0]?.defaultEntryUnitId ?? units[0]?.id ?? "",
  );
  const [sourceLocationId, setSourceLocationId] = useState(locations[0]?.id ?? "");
  const [sourceAreaId, setSourceAreaId] = useState("");
  const [sourceBinId, setSourceBinId] = useState("");
  const [destLocationId, setDestLocationId] = useState(locations[0]?.id ?? "");
  const [destAreaId, setDestAreaId] = useState("");
  const [destBinId, setDestBinId] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [lineNotes, setLineNotes] = useState("");

  const selectedItem = items.find((item) => item.id === itemId);
  const itemVariants = useMemo(
    () => variants.filter((variant) => variant.itemId === itemId),
    [variants, itemId],
  );
  const sourceAreas = useMemo(
    () => areas.filter((area) => area.locationId === sourceLocationId),
    [areas, sourceLocationId],
  );
  const sourceBins = useMemo(
    () => bins.filter((bin) => bin.storageAreaId === sourceAreaId),
    [bins, sourceAreaId],
  );
  const destAreas = useMemo(
    () => areas.filter((area) => area.locationId === destLocationId),
    [areas, destLocationId],
  );
  const destBins = useMemo(
    () => bins.filter((bin) => bin.storageAreaId === destAreaId),
    [bins, destAreaId],
  );

  useEffect(() => {
    if (!sourceAreaId && sourceAreas[0]) setSourceAreaId(sourceAreas[0].id);
  }, [sourceAreas, sourceAreaId]);

  useEffect(() => {
    if (!destAreaId && destAreas[0]) setDestAreaId(destAreas[0].id);
  }, [destAreas, destAreaId]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="font-mono text-sm text-muted">{transaction.transactionNumber}</p>
        <p className="text-sm capitalize text-muted">
          {TYPE_LABELS[type]} · {transaction.status}
        </p>
        {transaction.referenceText ? (
          <p className="text-sm">Reference: {transaction.referenceText}</p>
        ) : null}
        {transaction.notes ? <p className="text-sm">{transaction.notes}</p> : null}
      </div>

      {message ? <p className="text-sm text-accent">{message}</p> : null}

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border bg-surface text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Qty</th>
              {showSource ? <th className="px-3 py-2 font-medium">From</th> : null}
              {showDest ? <th className="px-3 py-2 font-medium">To</th> : null}
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
                  <div className="text-xs text-muted">base {line.baseQuantity}</div>
                </td>
                {showSource ? (
                  <td className="px-3 py-2 text-muted">
                    {line.sourceLocationName} / {line.sourceStorageAreaName}
                    {line.sourceBinName ? ` / ${line.sourceBinName}` : ""}
                  </td>
                ) : null}
                {showDest ? (
                  <td className="px-3 py-2 text-muted">
                    {line.destinationLocationName} / {line.destinationStorageAreaName}
                    {line.destinationBinName ? ` / ${line.destinationBinName}` : ""}
                  </td>
                ) : null}
                <td className="px-3 py-2 text-right">
                  {canManage && isDraft ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        setMessage(null);
                        startTransition(async () => {
                          const result = await removeInventoryLineAction(transaction.id, line.id);
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
                <td
                  colSpan={4 + (showSource ? 1 : 0) + (showDest ? 1 : 0)}
                  className="px-3 py-6 text-center text-muted"
                >
                  No lines yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {canManage && isDraft ? (
        <>
          <form
            className="grid gap-3 border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (pending) return;
              setMessage(null);
              startTransition(async () => {
                const result = await addInventoryLineAction(transaction.id, {
                  itemId,
                  variantId: variantId || null,
                  enteredQuantity: Number(enteredQuantity),
                  enteredUnitId,
                  sourceLocationId: showSource ? sourceLocationId : null,
                  sourceStorageAreaId: showSource ? sourceAreaId : null,
                  sourceBinId: showSource && sourceBinId ? sourceBinId : null,
                  destinationLocationId: showDest ? destLocationId : null,
                  destinationStorageAreaId: showDest ? destAreaId : null,
                  destinationBinId: showDest && destBinId ? destBinId : null,
                  unitCost: unitCost ? Number(unitCost) : null,
                  notes: lineNotes.trim() ? lineNotes : null,
                });
                if (!result.ok) {
                  setMessage(result.error);
                  return;
                }
                setLineNotes("");
                setUnitCost("");
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

            {showSource ? (
              <>
                <label className="space-y-1 text-sm">
                  <span className="text-muted">From location</span>
                  <select
                    required
                    value={sourceLocationId}
                    onChange={(e) => {
                      setSourceLocationId(e.target.value);
                      setSourceAreaId("");
                      setSourceBinId("");
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
                  <span className="text-muted">From area</span>
                  <select
                    required
                    value={sourceAreaId}
                    onChange={(e) => {
                      setSourceAreaId(e.target.value);
                      setSourceBinId("");
                    }}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  >
                    <option value="">Select area</option>
                    {sourceAreas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted">From bin</span>
                  <select
                    value={sourceBinId}
                    onChange={(e) => setSourceBinId(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  >
                    <option value="">No bin</option>
                    {sourceBins.map((bin) => (
                      <option key={bin.id} value={bin.id}>
                        {bin.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}

            {showDest ? (
              <>
                <label className="space-y-1 text-sm">
                  <span className="text-muted">To location</span>
                  <select
                    required
                    value={destLocationId}
                    onChange={(e) => {
                      setDestLocationId(e.target.value);
                      setDestAreaId("");
                      setDestBinId("");
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
                  <span className="text-muted">To area</span>
                  <select
                    required
                    value={destAreaId}
                    onChange={(e) => {
                      setDestAreaId(e.target.value);
                      setDestBinId("");
                    }}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  >
                    <option value="">Select area</option>
                    {destAreas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted">To bin</span>
                  <select
                    value={destBinId}
                    onChange={(e) => setDestBinId(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  >
                    <option value="">No bin</option>
                    {destBins.map((bin) => (
                      <option key={bin.id} value={bin.id}>
                        {bin.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}

            {type === "receipt" ? (
              <label className="space-y-1 text-sm">
                <span className="text-muted">Unit cost (optional)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </label>
            ) : null}

            <label className="space-y-1 text-sm lg:col-span-2">
              <span className="text-muted">Line notes</span>
              <input
                value={lineNotes}
                onChange={(e) => setLineNotes(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </label>
            <Button
              type="submit"
              disabled={
                pending ||
                (showSource && !sourceAreaId) ||
                (showDest && !destAreaId)
              }
            >
              Add line
            </Button>
          </form>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending || submitting || lines.length === 0}
              onClick={() => {
                if (submitting) return;
                setMessage(null);
                setSubmitting(true);
                startTransition(async () => {
                  const result = await completeInventoryTransactionAction(transaction.id);
                  if (!result.ok) {
                    setMessage(result.error);
                    setSubmitting(false);
                    return;
                  }
                  setMessage("Transaction completed.");
                  refresh();
                });
              }}
            >
              {submitting ? "Completing…" : "Complete"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || submitting}
              onClick={() => {
                setMessage(null);
                startTransition(async () => {
                  const result = await cancelInventoryTransactionAction(transaction.id);
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
