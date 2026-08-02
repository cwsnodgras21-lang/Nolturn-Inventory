# Inventory ledger

**Last reviewed:** 2026-08-02  
**Phase:** 2.4 — Ledger foundation

## Purpose

Stock quantities are derived from an immutable ledger. `items` never store on-hand quantity. `inventory_balances` is a rebuildable projection.

## Layers

1. **`inventory_transactions`** — business header (`opening_balance` | `positive_adjustment` in 2.4)
2. **`inventory_transaction_lines`** — entered item/unit/qty and destination
3. **`inventory_ledger_entries`** — immutable signed `quantity_delta` in base units
4. **`inventory_balances`** — projected on-hand by org/item/variant/location/area/bin

## Transaction lifecycle

| Status | Meaning |
| --- | --- |
| `draft` | Editable lines; no ledger effect |
| `completed` | Ledger posted; immutable |
| `cancelled` | Abandoned draft; no ledger effect |

Completion is atomic via `public.complete_inventory_transaction(uuid)`:

1. Lock header (`FOR UPDATE`)
2. Reject non-draft / already completed
3. Require `inventory.adjust` + location access per line
4. Recalculate conversion multiplier and base quantity server-side
5. Insert ledger entries
6. Apply balance deltas
7. Mark completed

Duplicate completion raises and does not double-post.

## Conversions

- If entered unit = item base unit → multiplier `1`
- Else require `item_unit_conversions` from entered unit to base
- `base_quantity = entered_quantity * multiplier`
- Browser-submitted base quantities are never trusted on complete

## Variant rules

If `items.requires_variant` is true, lines must include a variant belonging to the item.

`allow_negative_stock` remains stored for future policy; Phase 2.4 only posts positive deltas.

## Balances

Unique key uses `UNIQUE NULLS NOT DISTINCT` on:

`(organization_id, item_id, variant_id, location_id, storage_area_id, bin_id)`

Rebuild:

```sql
select public.rebuild_inventory_balances('<organization_id>');
```

Deletes org balances and re-sums ledger entries. Requires `inventory.adjust` when called by an authenticated user.

## Numbering

Human-readable numbers `ADJ-000001` from `inventory_transaction_counters` with upsert locking (concurrency-safe per organization).

## Permissions

| Key | Use |
| --- | --- |
| `inventory.read` | Read transactions, lines, ledger, balances |
| `inventory.adjust` | Create/edit drafts, complete, cancel, rebuild |

Location access still applies to lines, ledger, and balances.

## Immutability

- Completed headers/lines cannot be edited or deleted
- Ledger entries cannot be updated or deleted
- Tenant users cannot write balances directly
- Future corrections use compensating transactions (ADR-0004)

## Out of scope (2.4)

Receipts, consumption, negative adjustments, transfers, reversals, lots, expiration, counts.
