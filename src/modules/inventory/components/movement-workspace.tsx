"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  addInventoryLineAction,
  cancelInventoryTransactionAction,
  completeInventoryTransactionAction,
  createInventoryTransactionAction,
  removeInventoryLineAction,
  reverseInventoryTransactionAction,
} from "@/modules/inventory/commands";
import type {
  InventoryTransaction,
  InventoryTransactionLine,
  InventoryTransactionType,
} from "@/modules/inventory/types";
import type { CatalogItem, ItemVariant, UnitOfMeasure } from "@/modules/catalog/types";
import { createLotAction } from "@/modules/lots/commands";
import type { InventoryLot } from "@/modules/lots/types";
import type { StorageArea, StorageBin } from "@/modules/storage/types";

type LocationOption = { id: string; name: string };

const TYPE_LABELS: Record<InventoryTransactionType, string> = {
  opening_balance: "Opening balance",
  positive_adjustment: "Positive adjustment",
  negative_adjustment: "Negative adjustment",
  receipt: "Receive inventory",
  consumption: "Consume inventory",
  transfer: "Transfer inventory",
  reversal: "Reversal",
};

function needsDestination(type: InventoryTransactionType) {
  return (
    type === "opening_balance" ||
    type === "positive_adjustment" ||
    type === "receipt" ||
    type === "transfer" ||
    type === "reversal"
  );
}

function needsSource(type: InventoryTransactionType) {
  return (
    type === "consumption" ||
    type === "negative_adjustment" ||
    type === "transfer" ||
    type === "reversal"
  );
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
  lots = [],
  canManage,
  canManageLots = false,
  canReverse = false,
  linkedOriginalNumber = null,
  linkedReversalNumber = null,
}: {
  transaction: InventoryTransaction;
  lines: InventoryTransactionLine[];
  items: CatalogItem[];
  variants: ItemVariant[];
  units: UnitOfMeasure[];
  locations: LocationOption[];
  areas: StorageArea[];
  bins: StorageBin[];
  lots?: InventoryLot[];
  canManage: boolean;
  canManageLots?: boolean;
  canReverse?: boolean;
  linkedOriginalNumber?: string | null;
  linkedReversalNumber?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reversalReason, setReversalReason] = useState("");

  const type = transaction.transactionType;
  const showDest =
    needsDestination(type) &&
    (type !== "reversal" || lines.some((line) => line.destinationLocationId));
  const showSource =
    needsSource(type) &&
    (type !== "reversal" || lines.some((line) => line.sourceLocationId));
  const isDraft = transaction.status === "draft";
  const isReversed = transaction.status === "reversed";

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
  const [lotId, setLotId] = useState("");
  const [newLotNumber, setNewLotNumber] = useState("");
  const [newLotExpiration, setNewLotExpiration] = useState("");
  const [createNewLot, setCreateNewLot] = useState(false);

  const selectedItem = items.find((item) => item.id === itemId);
  const requiresLot = selectedItem?.trackingMode === "lot";
  const itemVariants = useMemo(
    () => variants.filter((variant) => variant.itemId === itemId),
    [variants, itemId],
  );
  const itemLots = useMemo(
    () =>
      lots.filter(
        (lot) =>
          lot.itemId === itemId &&
          lot.variantId === (variantId || null) &&
          lot.status === "active",
      ),
    [lots, itemId, variantId],
  );
  const sourceAreas = useMemo(
    () => areas.filter((area) => area.locationId === sourceLocationId),
    [areas, sourceLocationId],
  );
  const effectiveSourceAreaId = sourceAreas.some((area) => area.id === sourceAreaId)
    ? sourceAreaId
    : (sourceAreas[0]?.id ?? "");
  const sourceBins = useMemo(
    () => bins.filter((bin) => bin.storageAreaId === effectiveSourceAreaId),
    [bins, effectiveSourceAreaId],
  );
  const destAreas = useMemo(
    () => areas.filter((area) => area.locationId === destLocationId),
    [areas, destLocationId],
  );
  const effectiveDestAreaId = destAreas.some((area) => area.id === destAreaId)
    ? destAreaId
    : (destAreas[0]?.id ?? "");
  const destBins = useMemo(
    () => bins.filter((bin) => bin.storageAreaId === effectiveDestAreaId),
    [bins, effectiveDestAreaId],
  );
  const effectiveSourceBinId = sourceBins.some((bin) => bin.id === sourceBinId)
    ? sourceBinId
    : "";
  const effectiveDestBinId = destBins.some((bin) => bin.id === destBinId) ? destBinId : "";

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
        {isReversed ? (
          <p className="text-sm text-accent">This transaction has been reversed.</p>
        ) : null}
        {transaction.reversedByTransactionId && linkedReversalNumber ? (
          <p className="text-sm">
            Reversed by{" "}
            <Link
              href={`/inventory/transactions/${transaction.reversedByTransactionId}`}
              className="underline underline-offset-2"
            >
              {linkedReversalNumber}
            </Link>
          </p>
        ) : null}
        {transaction.reversesTransactionId && linkedOriginalNumber ? (
          <p className="text-sm">
            Reverses{" "}
            <Link
              href={`/inventory/transactions/${transaction.reversesTransactionId}`}
              className="underline underline-offset-2"
            >
              {linkedOriginalNumber}
            </Link>
          </p>
        ) : null}
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
              <th className="px-3 py-2 font-medium">Lot</th>
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
                <td className="px-3 py-2 font-mono text-xs text-muted">
                  {line.lotNumber ?? "—"}
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
                  colSpan={5 + (showSource ? 1 : 0) + (showDest ? 1 : 0)}
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
                let resolvedLotId: string | null = lotId || null;
                if (requiresLot && createNewLot) {
                  if (!canManageLots) {
                    setMessage("You do not have permission to create lots.");
                    return;
                  }
                  if (!newLotNumber.trim()) {
                    setMessage("Enter a lot number.");
                    return;
                  }
                  const created = await createLotAction({
                    itemId,
                    variantId: variantId || null,
                    lotNumber: newLotNumber.trim(),
                    expirationDate: newLotExpiration || null,
                    status: "active",
                  });
                  if (!created.ok) {
                    setMessage(created.error);
                    return;
                  }
                  resolvedLotId = created.data.id;
                }
                if (requiresLot && !resolvedLotId) {
                  setMessage("Select or create a lot for this item.");
                  return;
                }

                const result = await addInventoryLineAction(transaction.id, {
                  itemId,
                  variantId: variantId || null,
                  lotId: requiresLot ? resolvedLotId : null,
                  enteredQuantity: Number(enteredQuantity),
                  enteredUnitId,
                  sourceLocationId: showSource ? sourceLocationId : null,
                  sourceStorageAreaId: showSource ? effectiveSourceAreaId : null,
                  sourceBinId: showSource && effectiveSourceBinId ? effectiveSourceBinId : null,
                  destinationLocationId: showDest ? destLocationId : null,
                  destinationStorageAreaId: showDest ? effectiveDestAreaId : null,
                  destinationBinId: showDest && effectiveDestBinId ? effectiveDestBinId : null,
                  unitCost: unitCost ? Number(unitCost) : null,
                  notes: lineNotes.trim() ? lineNotes : null,
                });
                if (!result.ok) {
                  setMessage(result.error);
                  return;
                }
                setLineNotes("");
                setUnitCost("");
                setLotId("");
                setNewLotNumber("");
                setNewLotExpiration("");
                setCreateNewLot(false);
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
                  setLotId("");
                  setCreateNewLot(false);
                }}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.sku})
                    {item.trackingMode === "lot" ? " · lot" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted">Variant</span>
              <select
                value={variantId}
                onChange={(e) => {
                  setVariantId(e.target.value);
                  setLotId("");
                }}
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
                    value={effectiveSourceAreaId}
                    onChange={(e) => {
                      setSourceAreaId(e.target.value);
                      setSourceBinId("");
                    }}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  >
                    {sourceAreas.length === 0 ? <option value="">Select area</option> : null}
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
                    value={effectiveSourceBinId}
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
                    value={effectiveDestAreaId}
                    onChange={(e) => {
                      setDestAreaId(e.target.value);
                      setDestBinId("");
                    }}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  >
                    {destAreas.length === 0 ? <option value="">Select area</option> : null}
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
                    value={effectiveDestBinId}
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

            {requiresLot ? (
              <>
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="text-muted">Lot</span>
                  <select
                    value={createNewLot ? "__new__" : lotId}
                    onChange={(e) => {
                      if (e.target.value === "__new__") {
                        setCreateNewLot(true);
                        setLotId("");
                        return;
                      }
                      setCreateNewLot(false);
                      setLotId(e.target.value);
                    }}
                    required={!createNewLot}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  >
                    <option value="">Select lot</option>
                    {itemLots.map((lot) => (
                      <option key={lot.id} value={lot.id}>
                        {lot.lotNumber}
                        {lot.expirationDate ? ` · exp ${lot.expirationDate}` : ""}
                      </option>
                    ))}
                    {canManageLots && (showDest || type === "receipt") ? (
                      <option value="__new__">Create new lot…</option>
                    ) : null}
                  </select>
                </label>
                {createNewLot ? (
                  <>
                    <label className="space-y-1 text-sm">
                      <span className="text-muted">New lot number</span>
                      <input
                        required
                        value={newLotNumber}
                        onChange={(e) => setNewLotNumber(e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-3 py-2"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-muted">Expiration (optional)</span>
                      <input
                        type="date"
                        value={newLotExpiration}
                        onChange={(e) => setNewLotExpiration(e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-3 py-2"
                      />
                    </label>
                  </>
                ) : null}
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
                (showSource && !effectiveSourceAreaId) ||
                (showDest && !effectiveDestAreaId)
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

      {canReverse ? (
        <form
          className="grid max-w-xl gap-3 border border-border bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (pending || submitting) return;
            setMessage(null);
            setSubmitting(true);
            startTransition(async () => {
              const result = await reverseInventoryTransactionAction(transaction.id, {
                reason: reversalReason,
              });
              if (!result.ok) {
                setMessage(result.error);
                setSubmitting(false);
                return;
              }
              router.push(`/inventory/transactions/${result.data.id}`);
              router.refresh();
            });
          }}
        >
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Reverse transaction</h2>
            <p className="text-sm text-muted">
              Creates a completed reversal that posts exact inverse ledger entries.
            </p>
          </div>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Reversal reason (required)</span>
            <textarea
              required
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <Button type="submit" disabled={pending || submitting || !reversalReason.trim()}>
            {submitting ? "Reversing…" : "Reverse"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
