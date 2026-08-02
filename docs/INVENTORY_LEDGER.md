# Inventory ledger

**Last reviewed:** 2026-08-02  
**Phase:** 2.5 — Core inventory movements

## Purpose

Stock quantities are derived from an immutable ledger. `items` never store on-hand quantity. `inventory_balances` is a rebuildable projection.

## Layers

1. **`inventory_transactions`** — business header
2. **`inventory_transaction_lines`** — entered item/unit/qty with source and/or destination storage
3. **`inventory_ledger_entries`** — immutable signed `quantity_delta` in base units (`effect_role` distinguishes transfer sides)
4. **`inventory_balances`** — projected on-hand by org/item/variant/location/area/bin

## Transaction types

| Type | Sides | Ledger effect | Permission |
| --- | --- | --- | --- |
| `opening_balance` | destination | +delta (`primary`) | `inventory.adjust` |
| `positive_adjustment` | destination | +delta (`primary`) | `inventory.adjust` |
| `negative_adjustment` | source | −delta (`primary`); header `notes` required | `inventory.adjust` |
| `receipt` | destination | +delta (`primary`); optional `reference_text` | `inventory.receive` |
| `consumption` | source | −delta (`primary`) | `inventory.consume` |
| `transfer` | source + destination (must differ) | −source / +destination | `inventory.transfer` |

## Transaction lifecycle

| Status | Meaning |
| --- | --- |
| `draft` | Editable lines; no ledger effect |
| `completed` | Ledger posted; immutable |
| `cancelled` | Abandoned draft; no ledger effect |

Completion is atomic via `public.complete_inventory_transaction(uuid)`:

1. Lock header (`FOR UPDATE`)
2. Reject non-draft / already completed
3. Require type-specific permission + location access on each referenced side
4. For debits: `private.lock_and_assert_sufficient_stock` at exact dimensions (`FOR UPDATE`)
5. Recalculate conversion multiplier and base quantity server-side
6. Insert ledger entries and apply balance deltas
7. Mark completed

Duplicate completion raises and does not double-post. Multi-line completion is all-or-nothing.

## Negative stock

`items.allow_negative_stock` is enforced at completion for consumption, negative adjustment, and transfer source debits.

- When `false` (default): insufficient stock at the **exact** balance dimensions raises
- When `true`: debit may proceed below zero
- Exact match: `bin_id` null ≠ any bin; location/area/variant must match precisely

## Conversions

- If entered unit = item base unit → multiplier `1`
- Else require `item_unit_conversions` from entered unit to base
- `base_quantity = entered_quantity * multiplier`
- Browser-submitted base quantities are never trusted on complete

## Variant rules

If `items.requires_variant` is true, lines must include a variant belonging to the item.

## Balances

Unique key uses `UNIQUE NULLS NOT DISTINCT` on:

`(organization_id, item_id, variant_id, location_id, storage_area_id, bin_id)`

Rebuild:

```sql
select public.rebuild_inventory_balances('<organization_id>');
```

Deletes org balances and re-sums ledger entries. Requires `inventory.adjust` when called by an authenticated user.

## Numbering

Per-organization counters with type prefixes:

| Type | Prefix |
| --- | --- |
| opening balance | `OB-` |
| positive adjustment | `ADJ-` |
| negative adjustment | `NADJ-` |
| receipt | `RCV-` |
| consumption | `CON-` |
| transfer | `XFR-` |

## Permissions

| Key | Use |
| --- | --- |
| `inventory.read` | Read transactions, lines, ledger, balances |
| `inventory.adjust` | Opening balance / ± adjustments, rebuild |
| `inventory.receive` | Receipts |
| `inventory.consume` | Consumption |
| `inventory.transfer` | Transfers |

Draft line/header RLS allows any of the movement permissions. Location access for source/destination is enforced in app commands and inside `complete_inventory_transaction` (not on line insert RLS).

Role seed highlights: Purchasing Manager → `inventory.receive`; Staff → `inventory.consume`; Location Manager / Inventory Manager → all movement permissions (still location-scoped).

## Immutability

- Completed headers/lines cannot be edited or deleted
- Ledger entries cannot be updated or deleted
- Tenant users cannot write balances directly
- Future corrections use compensating transactions (ADR-0004); reversals remain out of scope

## Out of scope (2.5)

Reversals, lots, expiration, counts, procurement.
