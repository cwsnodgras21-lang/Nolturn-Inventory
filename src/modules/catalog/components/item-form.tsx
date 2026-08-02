"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createItemAction, updateItemAction } from "@/modules/catalog/item-commands";
import type { CatalogItem, ItemCategory, UnitOfMeasure } from "@/modules/catalog/types";

export function ItemForm({
  mode,
  item,
  units,
  categories,
}: {
  mode: "create" | "edit";
  item?: CatalogItem;
  units: UnitOfMeasure[];
  categories: ItemCategory[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [sku, setSku] = useState(item?.sku ?? "");
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? "");
  const [baseUnitId, setBaseUnitId] = useState(item?.baseUnitId ?? units[0]?.id ?? "");
  const [defaultEntryUnitId, setDefaultEntryUnitId] = useState(
    item?.defaultEntryUnitId ?? item?.baseUnitId ?? units[0]?.id ?? "",
  );
  const [status, setStatus] = useState<"active" | "inactive">(item?.status ?? "active");
  const [requiresVariant, setRequiresVariant] = useState(item?.requiresVariant ?? false);
  const [allowNegativeStock, setAllowNegativeStock] = useState(
    item?.allowNegativeStock ?? false,
  );

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const payload = {
      name,
      description: description.trim() ? description : null,
      categoryId: categoryId || null,
      baseUnitId,
      defaultEntryUnitId,
      sku,
      status,
      requiresVariant,
      allowNegativeStock,
    };

    startTransition(async () => {
      if (mode === "create") {
        const result = await createItemAction(payload);
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        router.push(`/administration/catalog/items/${result.data.id}`);
        router.refresh();
        return;
      }

      if (!item) return;
      const result = await updateItemAction(item.id, payload);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage("Item saved.");
      router.push(`/administration/catalog/items/${item.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-2xl gap-4 border border-border bg-surface p-5">
      <label className="space-y-1 text-sm">
        <span className="text-muted">Name</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-muted">SKU</span>
        <input
          required
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono"
        />
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-muted">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-muted">Category</span>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2"
        >
          <option value="">No category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted">Base unit</span>
          <select
            required
            value={baseUnitId}
            onChange={(e) => {
              setBaseUnitId(e.target.value);
              if (!defaultEntryUnitId) setDefaultEntryUnitId(e.target.value);
            }}
            className="w-full rounded-md border border-border bg-background px-3 py-2"
          >
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.symbol})
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">
            Future ledger quantities use this unit. Once inventory transactions exist, changing it
            will be restricted.
          </p>
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-muted">Default entry unit</span>
          <select
            required
            value={defaultEntryUnitId}
            onChange={(e) => setDefaultEntryUnitId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2"
          >
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.symbol})
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">
            If different from base, add a conversion to the base unit on the item detail page.
          </p>
        </label>
      </div>

      <label className="space-y-1 text-sm">
        <span className="text-muted">Status</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
          className="w-full rounded-md border border-border bg-background px-3 py-2"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={requiresVariant}
          onChange={(e) => setRequiresVariant(e.target.checked)}
          className="mt-1"
        />
        <span>
          Requires variant
          <span className="block text-xs text-muted">
            Future inventory transactions must specify a variant when this is enabled.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={allowNegativeStock}
          onChange={(e) => setAllowNegativeStock(e.target.checked)}
          className="mt-1"
        />
        <span>
          Allow negative stock (future)
          <span className="block text-xs text-muted">
            Reserved for inventory policy. Not enforced until a ledger exists.
          </span>
        </span>
      </label>

      {message ? <p className="text-sm text-accent">{message}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {mode === "create" ? "Create item" : "Save changes"}
        </Button>
        <Button
          href={item ? `/administration/catalog/items/${item.id}` : "/administration/catalog/items"}
          variant="ghost"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
