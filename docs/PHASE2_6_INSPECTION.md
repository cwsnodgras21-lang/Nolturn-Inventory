# Phase 2.6 inspection

**Date:** 2026-08-02

## 1. Phase 2.5 matches documentation

Yes. Core movements (receipt, consumption, ±adjustment, transfer), negative-stock enforcement at exact dimensions, dual-post transfers, movement permissions, UI workspaces, and extended RLS tests are present. Draft line RLS still allows unauthorized locations; access is enforced on complete and in app commands. Reversals are out of scope in 2.5.

## 2. Helpers to reuse

| Helper | Reuse |
| --- | --- |
| `complete_inventory_transaction` | Leave for draft→complete; add separate `reverse_inventory_transaction` |
| `lock_and_assert_sufficient_stock` / `post_ledger_and_balance` / `apply_inventory_balance_delta` | Reversal debit checks + inverse posting |
| `requirePermission` / `requireLocationAccess` | Reverse command + draft line hardening |
| Ledger immutability triggers | Extend to allow completed→reversed transition only via controlled columns |
| `rebuild_inventory_balances` | Keep; gate remains `inventory.adjust` |
| Audit + movement UI patterns | Add reverse action + link display |

## 3. Conflicts / decisions

| Topic | Decision |
| --- | --- |
| Reversal shape | New type `reversal`; new completed tx that posts exact inverse ledger rows |
| Linking | `reverses_transaction_id` on reversal; `reversed_by_transaction_id` on original; both immutable after set |
| Original status | Transition `completed` → `reversed` when successfully reversed |
| Quantities | Copy original line entered/base/multiplier as stored; negate ledger deltas exactly; do not re-resolve conversions |
| Cannot reverse | Drafts, cancelled, already reversed, or type=`reversal` |
| Negative stock | Before posting a debiting inverse entry, `lock_and_assert_sufficient_stock` |
| Draft locations | Line INSERT/UPDATE RLS requires `user_can_access_location` on non-null source/dest; generic error |
| Reconciliation | New `reconcile_inventory_balances(org)` returns mismatch rows; requires `inventory.adjust` |
| Rebuild | Unchanged permission (`inventory.adjust` only); not for staff/read-only |
| ADR | No supersede; ADR-0004 compensating transactions |

## 4. Migration sequence

1. `phase2_6_inventory_reverse_permission` — `inventory.reverse` + role seed/backfill
2. `phase2_6_inventory_reversals` — columns, status, reverse RPC, immutability, draft location RLS, reconcile RPC

## 5. Expected file changes

- Migrations + `PERMISSION_KEYS`
- Inventory types/schemas/commands/queries/mappers/UI
- Audit `inventory.transaction.reversed`
- Transaction detail reverse panel + list status
- Extended RLS tests + Phase 2 e2e
- Docs through ROADMAP Phase 2.6 complete

## 6. Assumptions

1. One successful reversal per original; concurrent attempts: header `FOR UPDATE` → one wins.
2. Reversal reason required (non-empty notes on the reversal header).
3. Reversal lines mirror original lines for history; ledger is sourced from original ledger entries negated.
4. Location Manager may reverse only when every affected ledger location is accessible.
5. Purchasing Manager / Staff / Read Only do not receive `inventory.reverse`.
6. Unauthorized location IDs fail with the same message as inaccessible (no existence leak).

## Completion notes

Phase 2.6 closes Phase 2 inventory operations with reversals, draft location hardening, and reconciliation. Lots, expiration, and counts remain Phase 3+.

### Delivered checklist

- [x] Inspection recorded
- [x] Migrations: `inventory.reverse`, reverse RPC, draft location RLS, reconcile RPC, link immutability
- [x] Domain layer + audit `inventory.transaction.reversed`
- [x] Reverse UI (reason, status, links, permission-aware)
- [x] RLS tests for reversals, draft hardening, reconcile/rebuild, concurrency
- [x] Docs updated to Phase 2.6
