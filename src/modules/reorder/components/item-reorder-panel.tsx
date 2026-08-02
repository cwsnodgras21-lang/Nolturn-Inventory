"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  deleteReorderRuleAction,
  upsertReorderRuleAction,
} from "@/modules/reorder/commands";
import type { ReorderRule } from "@/modules/reorder/types";

type Option = { id: string; name: string };

export function ItemReorderPanel({
  itemId,
  variants,
  locations,
  suppliers,
  rules,
  canManage,
}: {
  itemId: string;
  variants: Option[];
  locations: Option[];
  suppliers: Option[];
  rules: ReorderRule[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [variantId, setVariantId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [minimumQuantity, setMinimumQuantity] = useState("5");
  const [targetQuantity, setTargetQuantity] = useState("20");
  const [reorderQuantity, setReorderQuantity] = useState("");
  const [preferredSupplierId, setPreferredSupplierId] = useState("");
  const [notes, setNotes] = useState("");

  const defaults = rules.filter((rule) => rule.locationId == null);
  const overrides = rules.filter((rule) => rule.locationId != null);

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await upsertReorderRuleAction({
        itemId,
        variantId: variantId || null,
        locationId: locationId || null,
        minimumQuantity: Number(minimumQuantity),
        targetQuantity: Number(targetQuantity),
        reorderQuantity: reorderQuantity ? Number(reorderQuantity) : null,
        preferredSupplierId: preferredSupplierId || null,
        status: "active",
        notes: notes || null,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage("Reorder rule saved.");
      setReorderQuantity("");
      setNotes("");
      router.refresh();
    });
  }

  function remove(ruleId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await deleteReorderRuleAction(ruleId);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage("Reorder rule removed.");
      router.refresh();
    });
  }

  return (
    <section className="space-y-4 border border-border p-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Reorder rules</h2>
        <p className="text-sm text-muted">
          Default item rule applies everywhere. Location overrides take precedence. Restock uses
          usable on-hand only (active, non-expired lots).
        </p>
      </div>

      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border text-muted">
            <tr>
              <th className="px-2 py-2 font-medium">Scope</th>
              <th className="px-2 py-2 font-medium">Min</th>
              <th className="px-2 py-2 font-medium">Target</th>
              <th className="px-2 py-2 font-medium">Reorder qty</th>
              <th className="px-2 py-2 font-medium">Supplier</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {[...defaults, ...overrides].map((rule) => (
              <tr key={rule.id} className="border-b border-border/70">
                <td className="px-2 py-2">
                  {rule.locationName ? `Location: ${rule.locationName}` : "Default (all locations)"}
                  {rule.variantName ? (
                    <div className="text-xs text-muted">Variant: {rule.variantName}</div>
                  ) : null}
                </td>
                <td className="px-2 py-2">{rule.minimumQuantity}</td>
                <td className="px-2 py-2">{rule.targetQuantity}</td>
                <td className="px-2 py-2">{rule.reorderQuantity ?? "—"}</td>
                <td className="px-2 py-2">{rule.preferredSupplierName ?? "—"}</td>
                <td className="px-2 py-2 capitalize">{rule.status}</td>
                <td className="px-2 py-2 text-right">
                  {canManage ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => remove(rule.id)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
            {rules.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center text-muted">
                  No reorder rules yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {canManage ? (
        <div className="grid gap-3 md:grid-cols-2">
          {variants.length > 0 ? (
            <label className="space-y-1 text-sm">
              <span className="text-muted">Variant (optional)</span>
              <select
                value={variantId}
                onChange={(event) => setVariantId(event.target.value)}
                className="block w-full rounded-md border border-border bg-background px-3 py-2"
              >
                <option value="">Item default</option>
                {variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="space-y-1 text-sm">
            <span className="text-muted">Location override (optional)</span>
            <select
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              className="block w-full rounded-md border border-border bg-background px-3 py-2"
            >
              <option value="">Default (all locations)</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Minimum quantity</span>
            <input
              type="number"
              min={0}
              step="any"
              value={minimumQuantity}
              onChange={(event) => setMinimumQuantity(event.target.value)}
              className="block w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Target quantity</span>
            <input
              type="number"
              min={0}
              step="any"
              value={targetQuantity}
              onChange={(event) => setTargetQuantity(event.target.value)}
              className="block w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Fixed reorder quantity (optional)</span>
            <input
              type="number"
              min={0}
              step="any"
              value={reorderQuantity}
              onChange={(event) => setReorderQuantity(event.target.value)}
              className="block w-full rounded-md border border-border bg-background px-3 py-2"
              placeholder="Leave blank to fill to target"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Preferred supplier (optional)</span>
            <select
              value={preferredSupplierId}
              onChange={(event) => setPreferredSupplierId(event.target.value)}
              className="block w-full rounded-md border border-border bg-background px-3 py-2"
            >
              <option value="">None</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="text-muted">Notes</span>
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="block w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <div className="md:col-span-2">
            <Button type="button" disabled={pending} onClick={save}>
              Save rule
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
