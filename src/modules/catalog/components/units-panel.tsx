"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  changeUnitStatusAction,
  createUnitAction,
  updateUnitAction,
} from "@/modules/catalog/commands";
import { UNIT_DIMENSIONS, UNIT_KINDS, type UnitOfMeasure } from "@/modules/catalog/types";

export function UnitsCatalogPanel({
  units,
  canManage,
}: {
  units: UnitOfMeasure[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [dimension, setDimension] = useState<(typeof UNIT_DIMENSIONS)[number]>("count");
  const [unitKind, setUnitKind] = useState<(typeof UNIT_KINDS)[number]>("packaging");
  const [precision, setPrecision] = useState(0);

  const filtered = useMemo(() => {
    return units.filter((unit) => {
      if (statusFilter !== "all" && unit.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const term = search.trim().toLowerCase();
      return unit.name.toLowerCase().includes(term) || unit.symbol.toLowerCase().includes(term);
    });
  }, [units, search, statusFilter]);

  function createUnit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await createUnitAction({
        name,
        symbol,
        dimension,
        unitKind,
        precision,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setName("");
      setSymbol("");
      setMessage("Unit created.");
      router.refresh();
    });
  }

  function toggleStatus(unit: UnitOfMeasure) {
    setMessage(null);
    const next = unit.status === "active" ? "inactive" : "active";
    startTransition(async () => {
      const result = await changeUnitStatusAction(unit.id, { status: next });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      router.refresh();
    });
  }

  function saveEdit(unit: UnitOfMeasure, form: HTMLFormElement) {
    const formData = new FormData(form);
    setMessage(null);
    startTransition(async () => {
      const result = await updateUnitAction(unit.id, {
        name: String(formData.get("name") ?? unit.name),
        symbol: String(formData.get("symbol") ?? unit.symbol),
        precision: Number(formData.get("precision") ?? unit.precision),
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage("Unit updated.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or symbol"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {canManage ? (
        <form onSubmit={createUnit} className="grid gap-3 border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6">
          <label className="space-y-1 text-sm lg:col-span-2">
            <span className="text-muted">Name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="block w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Symbol</span>
            <input
              required
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="block w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Dimension</span>
            <select
              value={dimension}
              onChange={(e) => setDimension(e.target.value as typeof dimension)}
              className="block w-full rounded-md border border-border bg-background px-3 py-2"
            >
              {UNIT_DIMENSIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Kind</span>
            <select
              value={unitKind}
              onChange={(e) => setUnitKind(e.target.value as typeof unitKind)}
              className="block w-full rounded-md border border-border bg-background px-3 py-2"
            >
              {UNIT_KINDS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Precision</span>
            <input
              type="number"
              min={0}
              max={6}
              value={precision}
              onChange={(e) => setPrecision(Number(e.target.value))}
              className="block w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </label>
          <div className="flex items-end lg:col-span-6">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add unit"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted">You can view units but cannot create or edit them.</p>
      )}

      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">No units match this filter.</p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {filtered.map((unit) => (
            <li key={unit.id} className="bg-surface px-4 py-3">
              {canManage ? (
                <form
                  className="grid gap-2 sm:grid-cols-5 sm:items-end"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveEdit(unit, event.currentTarget);
                  }}
                >
                  <label className="space-y-1 text-sm sm:col-span-2">
                    <span className="text-muted">Name</span>
                    <input
                      name="name"
                      defaultValue={unit.name}
                      className="block w-full rounded-md border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-muted">Symbol</span>
                    <input
                      name="symbol"
                      defaultValue={unit.symbol}
                      className="block w-full rounded-md border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-muted">Precision</span>
                    <input
                      name="precision"
                      type="number"
                      min={0}
                      max={6}
                      defaultValue={unit.precision}
                      className="block w-full rounded-md border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="secondary" disabled={pending}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => toggleStatus(unit)}
                    >
                      {unit.status === "active" ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted sm:col-span-5">
                    {unit.dimension} · {unit.unitKind} · {unit.status}
                  </p>
                </form>
              ) : (
                <div>
                  <p className="font-medium">
                    {unit.name}{" "}
                    <span className="text-muted">({unit.symbol})</span>
                  </p>
                  <p className="text-xs text-muted">
                    {unit.dimension} · {unit.unitKind} · precision {unit.precision} · {unit.status}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
