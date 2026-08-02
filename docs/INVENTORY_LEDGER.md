# Inventory ledger

**Last reviewed:** 2026-08-02  
**Phase:** 3.2 — Purchasing foundation

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
| `reversal` | mirrors original | exact negation of original ledger rows | `inventory.reverse` (RPC only) |

## Transaction lifecycle

| Status | Meaning |
| --- | --- |
| `draft` | Editable lines; no ledger effect |
| `completed` | Ledger posted; immutable (except controlled reverse link) |
| `reversed` | Original completed transaction that has been reversed |
| `cancelled` | Abandoned draft; no ledger effect |

### Completion

Atomic via `public.complete_inventory_transaction(uuid)`:

1. Lock header (`FOR UPDATE`)
2. Reject non-draft / already completed
3. Require type-specific permission + location access on each referenced side
4. For debits: `private.lock_and_assert_sufficient_stock` at exact dimensions (`FOR UPDATE`)
5. Recalculate conversion multiplier and base quantity server-side
6. Insert ledger entries and apply balance deltas
7. Mark completed

Duplicate completion raises and does not double-post. Multi-line completion is all-or-nothing.

### Reversal

Atomic via `public.reverse_inventory_transaction(uuid, text)`:

1. Require non-empty reason + `inventory.reverse`
2. Lock original header; require `completed`, not already reversed, not type `reversal`
3. Require location access on every original ledger location
4. For each original credit, assert sufficient stock for the inverse debit (honors `allow_negative_stock`)
5. Create completed `reversal` transaction linked via `reverses_transaction_id`
6. Mirror original lines using **stored** entered/base/multiplier values (no conversion recalculation)
7. Post ledger entries that exactly negate original deltas
8. Mark original `reversed` and set `reversed_by_transaction_id`

One reversal per original (unique partial indexes + status guard). Concurrent attempts: one success.

## Negative stock

`items.allow_negative_stock` is enforced at completion for consumption, negative adjustment, and transfer source debits, and again for reverse inverse debits.

- When `false` (default): insufficient stock at the **exact** balance dimensions raises
- When `true`: debit may proceed below zero
- Exact match: `bin_id` null ≠ any bin; location/area/variant must match precisely
- Reversal never silently bypasses these rules

## Conversions

- If entered unit = item base unit → multiplier `1`
- Else require `item_unit_conversions` from entered unit to base
- `base_quantity = entered_quantity * multiplier`
- Browser-submitted base quantities are never trusted on complete
- Reversals reuse stored multipliers/base quantities from the original

## Variant rules

If `items.requires_variant` is true, lines must include a variant belonging to the item.

## Balances & reconciliation

Unique key uses `UNIQUE NULLS NOT DISTINCT` on:

`(organization_id, item_id, variant_id, location_id, storage_area_id, bin_id)`

Reconcile (admin/dev-safe mismatch detection; requires `inventory.adjust`):

```sql
select * from public.reconcile_inventory_balances('<organization_id>');
```

Returns rows where projection ≠ ledger sum. Empty result means aligned.

Rebuild (recovery tool; requires `inventory.adjust`):

```sql
select public.rebuild_inventory_balances('<organization_id>');
```

Deletes org balances and re-sums ledger entries. Normal tenant users without `inventory.adjust` cannot rebuild.

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
| reversal | `REV-` |

## Permissions

| Key | Use |
| --- | --- |
| `inventory.read` | Read transactions, lines, ledger, balances |
| `inventory.adjust` | Opening balance / ± adjustments, rebuild, reconcile |
| `inventory.receive` | Receipts |
| `inventory.consume` | Consumption |
| `inventory.transfer` | Transfers |
| `inventory.reverse` | Reverse completed transactions |
| `inventory.count.read` | View count sessions and history |
| `inventory.count.perform` | Create, start, enter, submit counts |
| `inventory.count.review` | Review variances, return, approve reconciliation |
| `purchasing.read` | View suppliers and purchase orders |
| `purchasing.manage` | Create/edit suppliers and draft POs; submit/cancel |
| `purchasing.receive` | Receive against submitted POs (also needs `inventory.receive`) |

Draft line/header RLS requires movement permissions. Draft line insert/update also requires `user_can_access_location` for non-null source/destination (unauthorized IDs are not persisted; errors do not reveal existence). Completion and reverse RPCs re-check location access as defense in depth.

Count role seed: Owner / Administrator / Inventory Manager / Location Manager → read/perform/review; Staff → read/perform; Read Only → read; Purchasing Manager → none. Location Manager remains location-scoped.

Purchasing role seed: Owner / Administrator / Inventory Manager / Purchasing Manager → read/manage/receive; Location Manager → read/receive (location-scoped); Staff / Read Only → read.

## Inventory counts (Phase 3.1)

Count sessions verify physical stock **without** editing balances directly.

### Lifecycle

| Status | Meaning |
| --- | --- |
| `draft` | Name, locations, blind flag editable |
| `in_progress` | Expected quantities frozen; counters enter counted qty |
| `ready_for_review` | Variances reviewable; quantities locked |
| `completed` | Accepted variances posted as adjustments |
| `cancelled` | Abandoned; no ledger effect |

RPCs: `start_count_session`, `submit_count_session_for_review`, `return_count_session_for_correction`, `review_count_line`, `approve_count_session_reconciliation`.

### Freeze & blind mode

- On start, non-zero balances in assigned locations become `count_lines` with `expected_quantity` copied from `inventory_balances`
- Expected quantity is immutable afterward (later movements do not change it)
- Blind sessions hide expected/variance from performers in the app; reviewers and post-submit states may see both
- Variance = `counted_quantity - expected_quantity` (base units)

### Reconciliation

Approve creates normal inventory transactions and calls `complete_inventory_transaction`:

- Accepted positive variances → one `positive_adjustment`
- Accepted negative variances → one `negative_adjustment`
- Rejected lines are skipped
- `count_lines.reconciliation_transaction_id` links each posted line
- Negative stock rules apply unchanged; failed approve is atomic

## Immutability

- Completed headers/lines cannot be edited or deleted
- Reversed originals and completed reversals cannot be edited
- Ledger entries cannot be updated or deleted
- Tenant users cannot write balances directly
- Tenants cannot create `reversal` drafts or set `reverses_transaction_id` / `reversed_by_transaction_id` directly
- Only the reverse RPC may transition `completed` → `reversed` with the link columns
- Completed/cancelled count sessions and their expected quantities are immutable

## Purchase order receiving (Phase 3.2)

PO receiving reuses the receipt engine — it does **not** edit balances directly.

### Flow

1. Lock PO (`FOR UPDATE`); require `purchasing.receive` + `inventory.receive` + destination location access
2. Reject qty > remaining (purchase units)
3. Create draft `receipt` with `purchase_order_id`
4. Insert lines linked via `purchase_order_line_id`, posting **base-unit** quantities using the frozen PO-line conversion multiplier
5. Call `complete_inventory_transaction`
6. Increment PO-line `received_quantity`; set PO status to `partially_received` or `received`

Atomic: failed multi-line receives roll back completely. Concurrent receives serialize on the PO row lock.

Standalone receipts (no PO) remain available under `/inventory/receive`.

## Out of scope (3.2)

Lots, expiration, serials, cycle-count scheduling, purchase requests/approvals, AP/payments, automated reordering, Stripe, PandaDoc, Nolt, industry modules.
