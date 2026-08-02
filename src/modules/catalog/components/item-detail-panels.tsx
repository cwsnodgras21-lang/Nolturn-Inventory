"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  createConversionAction,
  createIdentifierAction,
  createVariantAction,
  deleteConversionAction,
  deleteIdentifierAction,
  updateIdentifierAction,
  updateVariantAction,
} from "@/modules/catalog/item-commands";
import {
  IDENTIFIER_TYPES,
  type CatalogItem,
  type IdentifierType,
  type ItemIdentifier,
  type ItemUnitConversion,
  type ItemVariant,
  type UnitOfMeasure,
} from "@/modules/catalog/types";

export function ItemDetailPanels({
  item,
  variants,
  conversions,
  identifiers,
  units,
  canManage,
}: {
  item: CatalogItem;
  variants: ItemVariant[];
  conversions: ItemUnitConversion[];
  identifiers: ItemIdentifier[];
  units: UnitOfMeasure[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const [variantName, setVariantName] = useState("");
  const [variantSku, setVariantSku] = useState("");

  const [fromUnitId, setFromUnitId] = useState(
    units.find((u) => u.id !== item.baseUnitId)?.id ?? "",
  );
  const [multiplier, setMultiplier] = useState("1");

  const [identifierType, setIdentifierType] = useState<IdentifierType>("barcode");
  const [identifierValue, setIdentifierValue] = useState("");
  const [identifierVariantId, setIdentifierVariantId] = useState("");
  const [identifierPrimary, setIdentifierPrimary] = useState(false);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setMessage(result.error ?? "Operation failed.");
        return;
      }
      if (success) setMessage(success);
      router.refresh();
    });
  }

  return (
    <div className="space-y-10">
      {message ? <p className="text-sm text-accent">{message}</p> : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Variants</h2>
        <p className="text-sm text-muted">
          Optional sizes or styles. No fake default variants are created.
          {item.requiresVariant
            ? " This item requires a variant on future inventory transactions."
            : null}
        </p>
        <ul className="divide-y divide-border border border-border">
          {variants.map((variant) => (
            <li key={variant.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
              <div>
                <span className="font-medium">{variant.name}</span>
                {variant.sku ? (
                  <span className="ml-2 font-mono text-xs text-muted">{variant.sku}</span>
                ) : null}
                <span className="ml-2 capitalize text-muted">{variant.status}</span>
              </div>
              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () =>
                        updateVariantAction(item.id, variant.id, {
                          status: variant.status === "active" ? "inactive" : "active",
                        }),
                      "Variant status updated.",
                    )
                  }
                >
                  {variant.status === "active" ? "Deactivate" : "Activate"}
                </Button>
              ) : null}
            </li>
          ))}
          {variants.length === 0 ? (
            <li className="px-3 py-4 text-sm text-muted">No variants yet.</li>
          ) : null}
        </ul>
        {canManage ? (
          <form
            className="grid gap-3 border border-border bg-surface p-4 sm:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                const result = await createVariantAction(item.id, {
                  name: variantName,
                  sku: variantSku.trim() ? variantSku : null,
                });
                if (result.ok) {
                  setVariantName("");
                  setVariantSku("");
                }
                return result;
              }, "Variant created.");
            }}
          >
            <input
              required
              value={variantName}
              onChange={(e) => setVariantName(e.target.value)}
              placeholder="Variant name"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
            />
            <input
              value={variantSku}
              onChange={(e) => setVariantSku(e.target.value)}
              placeholder="SKU (optional)"
              className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
            />
            <Button type="submit" disabled={pending}>
              Add variant
            </Button>
          </form>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Unit conversions</h2>
        <p className="text-sm text-muted">
          Each conversion resolves directly to the base unit ({item.baseUnitSymbol ?? "base"}). No
          chained conversion logic.
        </p>
        <ul className="divide-y divide-border border border-border">
          {conversions.map((conversion) => (
            <li
              key={conversion.id}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span>
                1 {conversion.fromUnitSymbol} = {conversion.multiplier}{" "}
                {conversion.toUnitSymbol}
              </span>
              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => deleteConversionAction(item.id, conversion.id),
                      "Conversion removed.",
                    )
                  }
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
          {conversions.length === 0 ? (
            <li className="px-3 py-4 text-sm text-muted">No conversions yet.</li>
          ) : null}
        </ul>
        {canManage ? (
          <form
            className="grid gap-3 border border-border bg-surface p-4 sm:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                const result = await createConversionAction(item.id, {
                  fromUnitId,
                  multiplier: Number(multiplier),
                });
                if (result.ok) setMultiplier("1");
                return result;
              }, "Conversion created.");
            }}
          >
            <select
              required
              value={fromUnitId}
              onChange={(e) => setFromUnitId(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
            >
              <option value="" disabled>
                From unit
              </option>
              {units
                .filter((unit) => unit.id !== item.baseUnitId)
                .map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name} ({unit.symbol})
                  </option>
                ))}
            </select>
            <input
              required
              type="number"
              min="0.000001"
              step="any"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              placeholder="Multiplier to base"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={pending}>
              Add conversion
            </Button>
          </form>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Identifiers</h2>
        <p className="text-sm text-muted">
          Barcodes and codes. Keyboard-wedge scanners work in the value field. Values are unique
          within the organization.
        </p>
        <ul className="divide-y divide-border border border-border">
          {identifiers.map((identifier) => (
            <li
              key={identifier.id}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <div>
                <span className="uppercase text-muted">{identifier.identifierType}</span>
                <span className="ml-2 font-mono">{identifier.valueDisplay}</span>
                {identifier.isPrimary ? (
                  <span className="ml-2 text-xs text-accent">primary</span>
                ) : null}
                {identifier.variantId ? (
                  <span className="ml-2 text-xs text-muted">
                    variant{" "}
                    {variants.find((v) => v.id === identifier.variantId)?.name ?? "linked"}
                  </span>
                ) : null}
              </div>
              {canManage ? (
                <div className="flex gap-2">
                  {!identifier.isPrimary ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () =>
                            updateIdentifierAction(item.id, identifier.id, {
                              isPrimary: true,
                            }),
                          "Primary identifier set.",
                        )
                      }
                    >
                      Make primary
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => deleteIdentifierAction(item.id, identifier.id),
                        "Identifier removed.",
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
          {identifiers.length === 0 ? (
            <li className="px-3 py-4 text-sm text-muted">No identifiers yet.</li>
          ) : null}
        </ul>
        {canManage ? (
          <form
            className="grid gap-3 border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                const result = await createIdentifierAction(item.id, {
                  identifierType,
                  valueDisplay: identifierValue,
                  variantId: identifierVariantId || null,
                  isPrimary: identifierPrimary,
                });
                if (result.ok) {
                  setIdentifierValue("");
                  setIdentifierPrimary(false);
                }
                return result;
              }, "Identifier created.");
            }}
          >
            <select
              value={identifierType}
              onChange={(e) => setIdentifierType(e.target.value as IdentifierType)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {IDENTIFIER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <input
              required
              value={identifierValue}
              onChange={(e) => setIdentifierValue(e.target.value)}
              placeholder="Scan or type value"
              className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm lg:col-span-2"
            />
            <select
              value={identifierVariantId}
              onChange={(e) => setIdentifierVariantId(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Item level</option>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={identifierPrimary}
                  onChange={(e) => setIdentifierPrimary(e.target.checked)}
                />
                Primary
              </label>
              <Button type="submit" disabled={pending}>
                Add
              </Button>
            </div>
          </form>
        ) : null}
      </section>
    </div>
  );
}
