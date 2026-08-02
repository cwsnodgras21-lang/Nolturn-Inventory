"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  attachRecallLotAction,
  createRecallAction,
  detachRecallLotAction,
  quarantineRecallLotsAction,
  setRecallStatusAction,
} from "@/modules/recalls/commands";
import type {
  AffectedStockRow,
  InventoryRecall,
  RecallLot,
  RecallSeverity,
} from "@/modules/recalls/types";
import { RECALL_SEVERITIES } from "@/modules/recalls/types";
import type { InventoryLot } from "@/modules/lots/types";

export function CreateRecallForm({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [recallNumber, setRecallNumber] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [source, setSource] = useState("internal");
  const [severity, setSeverity] = useState<RecallSeverity>("medium");
  const [announcedDate, setAnnouncedDate] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <form
      className="grid max-w-xl gap-4 border border-border bg-surface p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || !canManage) return;
        setMessage(null);
        startTransition(async () => {
          const result = await createRecallAction({
            title,
            recallNumber,
            externalReference: externalReference || null,
            source,
            severity,
            announcedDate: announcedDate || null,
            notes: notes || null,
          });
          if (!result.ok) {
            setMessage(result.error);
            return;
          }
          router.push(`/inventory/recalls/${result.data.id}`);
          router.refresh();
        });
      }}
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">New recall</h2>
        <p className="text-sm text-muted">
          Create a draft, attach affected lots, then quarantine and close when done.
        </p>
      </div>
      {message ? <p className="text-sm text-accent">{message}</p> : null}
      <label className="space-y-1 text-sm">
        <span className="text-muted">Title</span>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted">Recall number</span>
        <input
          required
          value={recallNumber}
          onChange={(e) => setRecallNumber(e.target.value)}
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
        <span className="text-muted">Source</span>
        <input
          required
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted">Severity</span>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value as RecallSeverity)}
          className="w-full rounded-md border border-border bg-background px-3 py-3 text-base capitalize"
        >
          {RECALL_SEVERITIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted">Announced date</span>
        <input
          type="date"
          value={announcedDate}
          onChange={(e) => setAnnouncedDate(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-3 text-base"
        />
      </label>
      <Button type="submit" disabled={pending || !canManage}>
        Create draft
      </Button>
    </form>
  );
}

export function RecallsTable({ recalls }: { recalls: InventoryRecall[] }) {
  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-border bg-surface text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Number</th>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Severity</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium text-right">Lots</th>
            <th className="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {recalls.map((recall) => (
            <tr key={recall.id} className="border-b border-border/70">
              <td className="px-3 py-2 font-mono text-xs">{recall.recallNumber}</td>
              <td className="px-3 py-2">
                <div className="font-medium">{recall.title}</div>
                <div className="text-xs text-muted">{recall.source}</div>
              </td>
              <td className="px-3 py-2 capitalize">{recall.severity}</td>
              <td className="px-3 py-2 capitalize">{recall.status}</td>
              <td className="px-3 py-2 text-right">{recall.lotCount ?? 0}</td>
              <td className="px-3 py-2 text-right">
                <Link
                  href={`/inventory/recalls/${recall.id}`}
                  className="text-accent underline-offset-2 hover:underline"
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
          {recalls.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-muted">
                No recalls yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export function RecallWorkspace({
  recall,
  lots,
  availableLots,
  affectedStock,
  auditEvents,
  canManage,
}: {
  recall: InventoryRecall;
  lots: RecallLot[];
  availableLots: InventoryLot[];
  affectedStock: AffectedStockRow[];
  auditEvents: Array<{
    id: string;
    action: string;
    summary: string | null;
    created_at: string;
  }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [lotId, setLotId] = useState("");

  const attachedIds = useMemo(() => new Set(lots.map((lot) => lot.lotId)), [lots]);
  const attachable = availableLots.filter((lot) => !attachedIds.has(lot.id));
  const isOpen = recall.status === "draft" || recall.status === "active";

  function refresh() {
    startTransition(() => router.refresh());
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setMessage(result.error ?? "Action failed.");
        return;
      }
      if (success) setMessage(success);
      refresh();
    });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="font-mono text-sm text-muted">{recall.recallNumber}</p>
        <h2 className="text-2xl font-semibold tracking-tight">{recall.title}</h2>
        <p className="text-sm capitalize text-muted">
          {recall.status} · {recall.severity} · {recall.source}
          {recall.announcedDate ? ` · announced ${recall.announcedDate}` : ""}
        </p>
        {recall.externalReference ? (
          <p className="text-sm">External ref: {recall.externalReference}</p>
        ) : null}
        {recall.notes ? <p className="text-sm">{recall.notes}</p> : null}
        {recall.closedAt ? (
          <p className="text-sm text-muted">
            Closed {new Date(recall.closedAt).toLocaleString()}. Resolving does not release
            quarantined lots.
          </p>
        ) : null}
      </div>

      {message ? <p className="text-sm text-accent">{message}</p> : null}

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          {recall.status === "draft" ? (
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => setRecallStatusAction(recall.id, { status: "active" }), "Recall activated.")
              }
            >
              Activate
            </Button>
          ) : null}
          {isOpen ? (
            <>
              <Button
                type="button"
                disabled={pending || lots.length === 0}
                onClick={() =>
                  run(async () => {
                    const result = await quarantineRecallLotsAction(recall.id);
                    if (!result.ok) return result;
                    return {
                      ok: true as const,
                      error: undefined,
                    };
                  }, "Affected lots quarantined.")
                }
              >
                Quarantine affected lots
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  run(
                    () => setRecallStatusAction(recall.id, { status: "resolved" }),
                    "Recall resolved. Lots remain quarantined until released separately.",
                  )
                }
              >
                Resolve
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  run(() => setRecallStatusAction(recall.id, { status: "cancelled" }), "Recall cancelled.")
                }
              >
                Cancel
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Affected lots</h3>
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Lot</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">On hand</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => (
                <tr key={lot.id} className="border-b border-border/70">
                  <td className="px-3 py-2">
                    <div className="font-medium">{lot.itemName}</div>
                    <div className="font-mono text-xs text-muted">{lot.itemSku}</div>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/inventory/lots/${lot.lotId}`}
                      className="font-mono underline underline-offset-2"
                    >
                      {lot.lotNumber}
                    </Link>
                    {lot.expirationDate ? (
                      <div className="text-xs text-muted">exp {lot.expirationDate}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 capitalize">{lot.lotStatus}</td>
                  <td className="px-3 py-2 text-right">{lot.quantityOnHand ?? 0}</td>
                  <td className="px-3 py-2 text-right">
                    {canManage && isOpen ? (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          run(() => detachRecallLotAction(recall.id, lot.id), "Lot detached.")
                        }
                      >
                        Remove
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {lots.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted">
                    No lots attached.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {canManage && isOpen ? (
          <form
            className="flex flex-wrap items-end gap-3 border border-border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!lotId) return;
              run(() => attachRecallLotAction(recall.id, { lotId }), "Lot attached.");
              setLotId("");
            }}
          >
            <label className="space-y-1 text-sm">
              <span className="text-muted">Attach lot</span>
              <select
                required
                value={lotId}
                onChange={(e) => setLotId(e.target.value)}
                className="block min-w-[16rem] rounded-md border border-border bg-background px-3 py-3 text-base"
              >
                <option value="">Select lot</option>
                {attachable.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.lotNumber} · {lot.itemName}
                    {lot.status !== "active" ? ` (${lot.status})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={pending || !lotId}>
              Attach
            </Button>
          </form>
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Affected stock</h3>
        <p className="text-sm text-muted">
          Current on-hand by location for attached lots. Restricted members only see accessible
          locations.
        </p>
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Lot</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 font-medium">Storage</th>
                <th className="px-3 py-2 font-medium">Bin</th>
                <th className="px-3 py-2 font-medium text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {affectedStock.map((row) => (
                <tr
                  key={`${row.lotId}-${row.locationId}-${row.storageAreaId}-${row.binId}`}
                  className="border-b border-border/70"
                >
                  <td className="px-3 py-2 font-mono text-xs">{row.lotNumber}</td>
                  <td className="px-3 py-2">{row.locationName}</td>
                  <td className="px-3 py-2">{row.storageAreaName}</td>
                  <td className="px-3 py-2 text-muted">{row.binName ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {row.quantityOnHand} {row.baseUnitSymbol ?? ""}
                  </td>
                </tr>
              ))}
              {affectedStock.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted">
                    No accessible on-hand quantity for attached lots.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Recall history</h3>
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody>
              {auditEvents.map((event) => (
                <tr key={event.id} className="border-b border-border/70">
                  <td className="px-3 py-2 text-muted">
                    {new Date(event.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{event.action}</td>
                  <td className="px-3 py-2">{event.summary}</td>
                </tr>
              ))}
              {auditEvents.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-muted">
                    No audit events yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
