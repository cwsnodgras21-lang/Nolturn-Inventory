# Phase 2.5 inspection

**Date:** 2026-08-02

## 1. Phase 2.4 matches documentation

Yes. Opening balance / positive adjustment, atomic `complete_inventory_transaction`, balances, RLS, UI, and tests are present. Lines are destination-only; completion always posts positive deltas; `allow_negative_stock` is not enforced yet.

## 2. Helpers to reuse

| Helper | Reuse |
| --- | --- |
| `complete_inventory_transaction` | Extend — do not fork per workflow |
| `resolve_item_conversion_multiplier` / `apply_inventory_balance_delta` | Shared posting |
| `requirePermission` / `requireLocationAccess` | Per-workflow create + complete |
| Ledger immutability + draft-only line triggers | Unchanged |
| Inventory module / UI patterns | Extend with typed workflows |

## 3. Conflicts / decisions

| Topic | Decision |
| --- | --- |
| Line shape | Add nullable `source_*` columns; make `destination_*` nullable; type rules enforce which side is required |
| Transfer ledger | Two entries per line (`effect_role` = `source` \| `destination`); drop single-line unique |
| Completion | One RPC branches by `transaction_type` for permission, sides, and stock checks |
| Negative stock | Enforce at exact balance dimensions with `FOR UPDATE` before debit |
| Numbering | Type prefixes: `ADJ-`, `NADJ-`, `RCV-`, `CON-`, `XFR-` |
| Receipt reference | Optional `reference_text` on header |
| Negative adjustment reason | Header `notes` required (non-empty) |
| ADR | No supersede; still ADR-0004 |

## 4. Migration sequence

1. `phase2_5_inventory_movement_permissions` — keys + seed/backfill
2. `phase2_5_inventory_movements` — types, source columns, effect_role, complete RPC rewrite
3. (RLS updates in same movements migration if policy text must change for source locations)

## 5. Expected file changes

- Migrations
- Inventory types/schemas/commands/queries/UI
- Audit keys for receive/consume/transfer
- Stock + history filters
- Extended RLS tests
- Docs: INVENTORY_LEDGER + product docs

## 6. Assumptions

1. Inbound types (`opening_balance`, `positive_adjustment`, `receipt`): destination required; source null; +delta.
2. Outbound types (`consumption`, `negative_adjustment`): source required; destination null; −delta.
3. `transfer`: both sides required, must differ; −source and +destination; org quantity preserved.
4. Exact dimension matching for stock checks (bin null ≠ any bin).
5. Purchasing Manager gets `inventory.receive`; Staff gets `inventory.consume`; Location Manager gets all movement perms (still location-scoped).

## Completion notes

Phase 2.5 adds receipts, consumption, negative adjustments, and transfers with negative-stock enforcement. Reversals remain out of scope.

## Verification checklist (finish)

- [x] Fix Phase 2.4 restricted-location test assumption (location access on complete, not line insert)
- [x] Extended RLS/ledger tests for movement types, transfer totals, negative stock, concurrency, dimensions, audit
- [x] Docs updated to Phase 2.5
- [x] `npm run verify` (typecheck, lint, unit tests, build)
- [x] `npm run test:e2e`
- Local Supabase + `npm run db:bootstrap` + `npm run test:rls` needs host Docker with healthy container networking (cloud DinD could not keep Kong upstreams healthy)
