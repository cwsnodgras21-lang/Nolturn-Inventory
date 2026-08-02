# Phase 2.4 inspection

**Date:** 2026-08-02

## 1. Phase 2.3 matches documentation

Yes. Storage areas/bins, location-scoped RLS, `inventory.storage.*` permissions, admin UI, and bootstrap trees are present. No inventory ledger or quantities yet. Items already carry `requires_variant` and `allow_negative_stock` for future enforcement.

## 2. Helpers to reuse

| Helper | Reuse |
| --- | --- |
| `requirePermission` | `inventory.read` / `inventory.adjust` |
| `requireLocationAccess` | Destination location on lines + completion |
| `private.user_has_permission` / `user_can_access_location` | RLS + completion RPC checks |
| `writeAuditEvent` | Draft/create/complete/cancel events |
| Catalog conversions | Resolve entered unit → base multiplier |
| Storage FKs | Destination area/bin integrity |
| ADR-0004 | Immutable ledger; corrections via compensating txs later |

## 3. Conflicts / decisions

| Topic | Decision |
| --- | --- |
| Transaction types (2.4) | `opening_balance` and `positive_adjustment` only; both produce positive ledger deltas |
| Completion | Single security-definer RPC for atomic ledger + balance updates + status flip |
| Base quantity | Always recalculated server-side on complete; never trust client |
| Balance uniqueness | `UNIQUE NULLS NOT DISTINCT` on org/item/variant/location/area/bin |
| Storage area on lines | Required; bin optional |
| `allow_negative_stock` | Persist on item only; not enforced (positive-only phase) |
| `requires_variant` | Enforced on line write and completion |
| Module | Replace stub `src/modules/inventory/` |
| UI | Enable `/inventory` stock + transactions (not planned placeholder) |
| ADR | ADR-0004 already accepted; no supersede |

## 4. Migration sequence

1. `phase2_4_inventory_permissions` — keys + seed/backfill
2. `phase2_4_inventory_ledger` — tables, numbering, integrity, immutability, complete + rebuild RPCs
3. `phase2_4_inventory_rls` — RLS policies

## 5. Expected file changes

- Migrations + `PERMISSION_KEYS`
- `src/modules/inventory/*` (types, schemas, queries, commands, UI)
- Audit keys
- Enable inventory nav; routes for stock/transactions
- Bootstrap optional opening balance
- `docs/INVENTORY_LEDGER.md` + product docs
- RLS/integrity tests

## 6. Assumptions

1. Human-readable numbers: `ADJ-000001` style, per-organization counter with row lock.
2. Draft statuses: `draft` | `completed` | `cancelled`. Cancelled drafts have no ledger effect.
3. Line entered quantity must be > 0 for positive adjustments.
4. Conversion: if entered unit = base → multiplier 1; else require `item_unit_conversions` row to base.
5. Balances are a projection; ledger is source of truth; rebuild function recomputes from ledger sums.
6. Tenant users cannot UPDATE/DELETE ledger entries or balances; completion/rebuild are security definer.
7. Multi-line completion is all-or-nothing inside one DB transaction.

## Completion notes

Phase 2.4 delivers the ledger foundation and positive adjustment / opening balance only. Receipts, consumption, negative adjustments, transfers, and reversals remain out of scope.
