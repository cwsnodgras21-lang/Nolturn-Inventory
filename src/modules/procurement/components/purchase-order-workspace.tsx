"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  addPurchaseOrderLineAction,
  cancelPurchaseOrderAction,
  createPurchaseOrderAction,
  receivePurchaseOrderAction,
  removePurchaseOrderLineAction,
  submitPurchaseOrderAction,
} from "@/modules/procurement/commands";
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderReceipt,
} from "@/modules/procurement/types";
import type { CatalogItem, ItemVariant, UnitOfMeasure } from "@/modules/catalog/types";
import type { Supplier } from "@/modules/suppliers/types";
import type { StorageArea, StorageBin } from "@/modules/storage/types";

type LocationOption = { id: string; name: string };

export function CreatePurchaseOrderForm({
  suppliers,
  locations,
  canManage,
}: {
  suppliers: Supplier[];
  locations: LocationOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <form
      className="grid max-w-xl gap-4 border border-border bg-surface p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || !canManage) return;
        setMessage(null);
        startTransition(async () => {
          const result = await createPurchaseOrderAction({
            supplierId,
            shipToLocationId: locationId,
            orderDate,
            expectedDate: expectedDate || null,
            externalReference: externalReference || null,
            notes: notes || null,
          });
          if (!result.ok) {
            setMessage(result.error);
            return;
          }
          router.push(`/purchasing/orders/${result.data.id}`);
          router.refresh();
        });
      }}
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">New purchase order</h2>
        <p className="text-sm text-muted">Create a draft, add lines, then submit to receive.</p>
      </div>
      <label className="space-y-1 text-sm">
        <span className="text-muted">Supplier</span>
        <select
          required
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
        >
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted">Ship-to location</span>
        <select
          required
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
        >
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted">Order date</span>
        <input
          type="date"
          required
          value={orderDate}
          onChange={(e) => setOrderDate(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted">Expected date</span>
        <input
          type="date"
          value={expectedDate}
          onChange={(e) => setExpectedDate(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted">External reference</span>
        <input
          value={externalReference}
          onChange={(e) => setExternalReference(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
        />
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
          disabled={pending || !canManage || !supplierId || !locationId}
        >
          {pending ? "Creating…" : "Create draft"}
        </Button>
        <Button href="/purchasing/orders" variant="ghost">
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function PurchaseOrderWorkspace({
  order,
  lines,
  receipts,
  items,
  variants,
  units,
  locations,
  areas,
  bins,
  canManage,
  canReceive,
}: {
  order: PurchaseOrder;
  lines: PurchaseOrderLine[];
  receipts: PurchaseOrderReceipt[];
  items: CatalogItem[];
  variants: ItemVariant[];
  units: UnitOfMeasure[];
  locations: LocationOption[];
  areas: StorageArea[];
  bins: StorageBin[];
  canManage: boolean;
  canReceive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState("1");
  const [unitId, setUnitId] = useState(items[0]?.defaultEntryUnitId || items[0]?.baseUnitId || "");
  const [unitCost, setUnitCost] = useState("");

  const itemVariants = useMemo(
    () => variants.filter((variant) => variant.itemId === itemId),
    [variants, itemId],
  );

  const receiveable = lines.filter((line) => line.remainingQuantity > 0);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [receiveArea, setReceiveArea] = useState<Record<string, string>>({});
  const [receiveBin, setReceiveBin] = useState<Record<string, string>>({});
  const shipAreas = areas.filter((area) => area.locationId === order.shipToLocationId);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setMessage(result.error ?? "Action failed.");
        return;
      }
      if (success) setMessage(success);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-8">
      <div className="space-y-2 border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{order.poNumber}</h2>
            <p className="text-sm text-muted capitalize">
              {order.status.replaceAll("_", " ")} · {order.supplierName || "Supplier"} · Ship to{" "}
              {order.shipToLocationName || "location"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage && order.status === "draft" ? (
              <Button
                type="button"
                disabled={pending || lines.length === 0}
                onClick={() => run(() => submitPurchaseOrderAction(order.id), "Submitted.")}
              >
                Submit
              </Button>
            ) : null}
            {canManage && (order.status === "draft" || order.status === "submitted") ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => run(() => cancelPurchaseOrderAction(order.id), "Cancelled.")}
              >
                Cancel PO
              </Button>
            ) : null}
          </div>
        </div>
        {order.externalReference ? (
          <p className="text-sm text-muted">External ref: {order.externalReference}</p>
        ) : null}
        {order.notes ? <p className="text-sm">{order.notes}</p> : null}
        {message ? <p className="text-sm text-accent">{message}</p> : null}
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Lines</h3>
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Ordered</th>
                <th className="px-3 py-2 font-medium">Received</th>
                <th className="px-3 py-2 font-medium">Remaining</th>
                <th className="px-3 py-2 font-medium">Cost</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-b border-border/70">
                  <td className="px-3 py-2">
                    <div>{line.itemName}</div>
                    <div className="text-xs text-muted">
                      {line.itemSku}
                      {line.variantName ? ` · ${line.variantName}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {line.orderedQuantity} {line.purchaseUnitSymbol}
                  </td>
                  <td className="px-3 py-2">{line.receivedQuantity}</td>
                  <td className="px-3 py-2 font-medium">{line.remainingQuantity}</td>
                  <td className="px-3 py-2 text-muted">
                    {line.unitCost == null ? "—" : line.unitCost.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canManage && order.status === "draft" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          run(() => removePurchaseOrderLineAction(order.id, line.id))
                        }
                      >
                        Remove
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted">
                    No lines yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {canManage && order.status === "draft" ? (
        <form
          className="grid gap-3 border border-border p-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              const result = await addPurchaseOrderLineAction(order.id, {
                itemId,
                variantId: variantId || null,
                orderedQuantity: Number(qty),
                purchaseUnitId: unitId,
                unitCost: unitCost ? Number(unitCost) : null,
              });
              if (result.ok) {
                setQty("1");
                setUnitCost("");
              }
              return result;
            }, "Line added.");
          }}
        >
          <h3 className="text-lg font-semibold md:col-span-2">Add line</h3>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Item</span>
            <select
              value={itemId}
              onChange={(e) => {
                const next = e.target.value;
                setItemId(next);
                const item = items.find((entry) => entry.id === next);
                setUnitId(item?.defaultEntryUnitId || item?.baseUnitId || "");
                setVariantId("");
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
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
              className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
            >
              <option value="">None</option>
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
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Purchase unit</span>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
            >
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.symbol} — {unit.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="text-muted">Unit cost (optional)</span>
            <input
              inputMode="decimal"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
            />
          </label>
          <Button type="submit" disabled={pending || !itemId || !unitId}>
            Add line
          </Button>
        </form>
      ) : null}

      {canReceive &&
      (order.status === "submitted" || order.status === "partially_received") &&
      receiveable.length > 0 ? (
        <form
          className="grid gap-4 border border-border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const payloadLines = receiveable
              .map((line) => {
                const quantity = Number(receiveQty[line.id] || "0");
                if (!(quantity > 0)) return null;
                const areaId = receiveArea[line.id] || shipAreas[0]?.id;
                if (!areaId) return null;
                return {
                  purchaseOrderLineId: line.id,
                  quantity,
                  destinationLocationId: order.shipToLocationId,
                  destinationStorageAreaId: areaId,
                  destinationBinId: receiveBin[line.id] || null,
                };
              })
              .filter((line): line is NonNullable<typeof line> => Boolean(line));

            if (payloadLines.length === 0) {
              setMessage("Enter at least one receive quantity.");
              return;
            }

            run(
              () => receivePurchaseOrderAction(order.id, { lines: payloadLines }),
              "Receipt posted.",
            );
          }}
        >
          <h3 className="text-lg font-semibold">Receive</h3>
          <p className="text-sm text-muted">
            Enter quantities in purchase units. Stock posts through the inventory receipt ledger.
          </p>
          <div className="grid gap-3">
            {receiveable.map((line) => {
              const lineAreas = shipAreas;
              const areaId = receiveArea[line.id] || lineAreas[0]?.id || "";
              const lineBins = bins.filter((bin) => bin.storageAreaId === areaId);
              return (
                <div
                  key={line.id}
                  className="grid gap-2 border border-border p-3 md:grid-cols-4"
                >
                  <div className="md:col-span-4">
                    <div className="font-medium">{line.itemName}</div>
                    <div className="text-xs text-muted">
                      Remaining {line.remainingQuantity} {line.purchaseUnitSymbol}
                    </div>
                  </div>
                  <label className="space-y-1 text-sm">
                    <span className="text-muted">Qty</span>
                    <input
                      inputMode="decimal"
                      value={receiveQty[line.id] ?? ""}
                      onChange={(e) =>
                        setReceiveQty((current) => ({ ...current, [line.id]: e.target.value }))
                      }
                      placeholder={`Max ${line.remainingQuantity}`}
                      className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-muted">Storage area</span>
                    <select
                      value={areaId}
                      onChange={(e) =>
                        setReceiveArea((current) => ({ ...current, [line.id]: e.target.value }))
                      }
                      className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
                    >
                      {lineAreas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm md:col-span-2">
                    <span className="text-muted">Bin (optional)</span>
                    <select
                      value={receiveBin[line.id] ?? ""}
                      onChange={(e) =>
                        setReceiveBin((current) => ({ ...current, [line.id]: e.target.value }))
                      }
                      className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
                    >
                      <option value="">None</option>
                      {lineBins.map((bin) => (
                        <option key={bin.id} value={bin.id}>
                          {bin.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              );
            })}
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Posting…" : "Post receipt"}
          </Button>
        </form>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Receipt history</h3>
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Transaction</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Completed</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => (
                <tr key={receipt.id} className="border-b border-border/70">
                  <td className="px-3 py-2">{receipt.transactionNumber}</td>
                  <td className="px-3 py-2 capitalize">{receipt.status}</td>
                  <td className="px-3 py-2 text-muted">
                    {receipt.completedAt
                      ? new Date(receipt.completedAt).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/inventory/transactions/${receipt.id}`}
                      className="text-sm text-accent hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted">
                    No receipts yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {/* keep locations referenced for future ship-to overrides */}
        <span className="hidden">{locations.length}</span>
      </section>
    </div>
  );
}
