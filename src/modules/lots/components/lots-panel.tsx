"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  createLotAction,
  updateItemTrackingModeAction,
  updateLotAction,
} from "@/modules/lots/commands";
import type { ExpirationWindow, InventoryLot, LotStatus } from "@/modules/lots/types";
import { LOT_STATUSES } from "@/modules/lots/types";

export function LotsFilterBar({
  expiration,
  status,
}: {
  expiration: ExpirationWindow | "all";
  status: LotStatus | "all";
}) {
  const router = useRouter();
  return (
    <form
      className="flex flex-wrap gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const params = new URLSearchParams();
        const nextExpiration = String(data.get("expiration") || "all");
        const nextStatus = String(data.get("status") || "all");
        if (nextExpiration !== "all") params.set("expiration", nextExpiration);
        if (nextStatus !== "all") params.set("status", nextStatus);
        router.push(`/inventory/lots${params.size ? `?${params}` : ""}`);
      }}
    >
      <label className="space-y-1 text-sm">
        <span className="text-muted">Expiration</span>
        <select
          name="expiration"
          defaultValue={expiration}
          className="block min-w-[10rem] rounded-md border border-border bg-background px-3 py-2"
        >
          <option value="all">All</option>
          <option value="expired">Expired</option>
          <option value="30">Within 30 days</option>
          <option value="60">Within 60 days</option>
          <option value="90">Within 90 days</option>
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted">Status</span>
        <select
          name="status"
          defaultValue={status}
          className="block min-w-[10rem] rounded-md border border-border bg-background px-3 py-2"
        >
          <option value="all">All</option>
          {LOT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end">
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </div>
    </form>
  );
}

export function LotsTable({ lots }: { lots: InventoryLot[] }) {
  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead className="border-b border-border bg-surface text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="px-3 py-2 font-medium">Lot</th>
            <th className="px-3 py-2 font-medium">Expiration</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium text-right">On hand</th>
            <th className="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => (
            <tr key={lot.id} className="border-b border-border/70">
              <td className="px-3 py-2">
                <div className="font-medium">{lot.itemName ?? "Item"}</div>
                <div className="font-mono text-xs text-muted">
                  {lot.itemSku}
                  {lot.variantName ? ` · ${lot.variantName}` : ""}
                </div>
              </td>
              <td className="px-3 py-2 font-mono">{lot.lotNumber}</td>
              <td className="px-3 py-2 text-muted">{lot.expirationDate ?? "—"}</td>
              <td className="px-3 py-2 capitalize">{lot.status}</td>
              <td className="px-3 py-2 text-right font-medium">{lot.quantityOnHand ?? 0}</td>
              <td className="px-3 py-2 text-right">
                <Link
                  href={`/inventory/lots/${lot.id}`}
                  className="text-accent underline-offset-2 hover:underline"
                >
                  History
                </Link>
              </td>
            </tr>
          ))}
          {lots.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-muted">
                No lots match this filter.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export function ItemLotsPanel({
  itemId,
  trackingMode,
  variants,
  lots,
  canManageLots,
}: {
  itemId: string;
  trackingMode: "quantity" | "lot";
  variants: Array<{ id: string; name: string }>;
  lots: InventoryLot[];
  canManageLots: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [lotNumber, setLotNumber] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [variantId, setVariantId] = useState("");
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<"quantity" | "lot">(trackingMode);

  const itemLots = useMemo(() => lots.filter((lot) => lot.itemId === itemId), [lots, itemId]);

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Lot tracking</h2>
      <p className="text-sm text-muted">
        Lot-tracked items require a lot on every inventory movement. Tracking mode cannot change
        after inventory activity without a controlled migration.
      </p>
      {message ? <p className="text-sm text-accent">{message}</p> : null}

      {canManageLots ? (
        <form
          className="flex flex-wrap items-end gap-3 border border-border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage(null);
            startTransition(async () => {
              const result = await updateItemTrackingModeAction(itemId, { trackingMode: mode });
              if (!result.ok) {
                setMessage(result.error);
                return;
              }
              setMessage("Tracking mode updated.");
              router.refresh();
            });
          }}
        >
          <label className="space-y-1 text-sm">
            <span className="text-muted">Tracking mode</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "quantity" | "lot")}
              className="block min-w-[12rem] rounded-md border border-border bg-background px-3 py-2"
            >
              <option value="quantity">Quantity only</option>
              <option value="lot">Lot tracked</option>
            </select>
          </label>
          <Button type="submit" variant="secondary" disabled={pending || mode === trackingMode}>
            Save mode
          </Button>
        </form>
      ) : (
        <p className="text-sm">
          Current mode: <span className="capitalize">{trackingMode}</span>
        </p>
      )}

      {trackingMode === "lot" ? (
        <>
          <div className="overflow-x-auto border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border bg-surface text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Lot</th>
                  <th className="px-3 py-2 font-medium">Variant</th>
                  <th className="px-3 py-2 font-medium">Expiration</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">On hand</th>
                  {canManageLots ? <th className="px-3 py-2 font-medium" /> : null}
                </tr>
              </thead>
              <tbody>
                {itemLots.map((lot) => (
                  <tr key={lot.id} className="border-b border-border/70">
                    <td className="px-3 py-2 font-mono">{lot.lotNumber}</td>
                    <td className="px-3 py-2 text-muted">{lot.variantName ?? "—"}</td>
                    <td className="px-3 py-2 text-muted">{lot.expirationDate ?? "—"}</td>
                    <td className="px-3 py-2">
                      {canManageLots ? (
                        <select
                          defaultValue={lot.status}
                          disabled={pending}
                          onChange={(e) => {
                            const status = e.target.value as LotStatus;
                            setMessage(null);
                            startTransition(async () => {
                              const result = await updateLotAction(lot.id, { status });
                              if (!result.ok) {
                                setMessage(result.error);
                                return;
                              }
                              router.refresh();
                            });
                          }}
                          className="rounded-md border border-border bg-background px-2 py-1 capitalize"
                        >
                          {LOT_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="capitalize">{lot.status}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{lot.quantityOnHand ?? 0}</td>
                    {canManageLots ? (
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/inventory/lots/${lot.id}`}
                          className="text-xs underline underline-offset-2"
                        >
                          History
                        </Link>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {itemLots.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canManageLots ? 6 : 5}
                      className="px-3 py-6 text-center text-muted"
                    >
                      No lots yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {canManageLots ? (
            <form
              className="grid gap-3 border border-border p-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(event) => {
                event.preventDefault();
                setMessage(null);
                startTransition(async () => {
                  const result = await createLotAction({
                    itemId,
                    variantId: variantId || null,
                    lotNumber,
                    expirationDate: expirationDate || null,
                    notes: notes.trim() ? notes : null,
                    status: "active",
                  });
                  if (!result.ok) {
                    setMessage(result.error);
                    return;
                  }
                  setLotNumber("");
                  setExpirationDate("");
                  setNotes("");
                  setMessage("Lot created.");
                  router.refresh();
                });
              }}
            >
              <label className="space-y-1 text-sm">
                <span className="text-muted">Lot number</span>
                <input
                  required
                  value={lotNumber}
                  onChange={(e) => setLotNumber(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </label>
              {variants.length > 0 ? (
                <label className="space-y-1 text-sm">
                  <span className="text-muted">Variant</span>
                  <select
                    value={variantId}
                    onChange={(e) => setVariantId(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  >
                    <option value="">None</option>
                    {variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="space-y-1 text-sm">
                <span className="text-muted">Expiration</span>
                <input
                  type="date"
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2 lg:col-span-3">
                <span className="text-muted">Notes</span>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </label>
              <Button type="submit" disabled={pending}>
                Create lot
              </Button>
            </form>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
