# Phase 3.4 inspection

**Date:** 2026-08-02

## 1. Phase 3.3 matches documentation

Yes. Lot tracking, optional `lot_id` on ledger/balances/counts, quarantine via `inventory_lots.status`, expiration views, and `inventory.lots.*` permissions are live. Non-`active` lots are blocked by `private.assert_lot_for_item` on line integrity and completion (except reversals).

## 2. Helpers to reuse

| Helper / pattern | Reuse |
| --- | --- |
| `inventory_lots.status = 'quarantined'` | Single quarantine mechanism — no second status system |
| `private.assert_lot_for_item` | Already blocks receipt/consume/adjust/transfer/count complete |
| `listLotMovements` / balance queries | Affected stock + history on recall detail |
| Permission seed/backfill | Mirror lots: `inventory.recalls.read` / `manage` |
| Audit `writeAuditEvent` | Recall lifecycle + quarantine actions |
| Location access via `TenantContext.allowedLocationIds` | Filter affected-stock balances for restricted members |

## 3. Architectural concerns

| Concern | Resolution |
| --- | --- |
| Second quarantine system | Do not add; recall quarantine updates `inventory_lots.status` |
| Resolve releasing stock | Resolve/cancel only close the recall; leave lot status unchanged |
| Ledger rewrite | Never; quarantine is lot metadata only |
| Count reconcile while quarantined | Already fails via `complete_inventory_transaction` lot assert |
| Duplicate lot attach | Unique `(recall_id, lot_id)` |
| Cross-org lot attach | Integrity trigger + RLS org match |
| Restricted locations | App-layer filter on balance rows by accessible location IDs |
| Quarantine permission | SECURITY DEFINER RPC checks `inventory.recalls.manage` so managers need not also hold `inventory.lots.manage` |

## 4. Decisions

| Topic | Decision |
| --- | --- |
| Tables | `inventory_recalls`, `inventory_recall_lots` |
| Statuses | `draft`, `active`, `resolved`, `cancelled` |
| Severity | `informational`, `low`, `medium`, `high`, `critical` |
| Closed | `closed_at` / `closed_by` set on resolve or cancel |
| Quarantine action | `quarantine_recall_lots(uuid)` sets linked lots to `quarantined` |
| Activate | `draft` → `active` without auto-quarantine (explicit quarantine button) |
| Attach lots | Allowed in `draft` or `active` |
| Permissions | `inventory.recalls.read` / `inventory.recalls.manage` |
| ADR | No supersede; recalls are operational records over lots |

## 5. Migration sequence

1. `phase3_4_recall_permissions` — keys + role seed/backfill  
2. `phase3_4_recalls` — tables, integrity, quarantine RPC, RLS  

## 6. Expected file changes

- Migrations + permission catalog + `appConfig.phase = 3.4`
- `src/modules/recalls/` + `/inventory/recalls` routes
- Inventory home nav link
- `supabase/tests/rls.recalls.test.ts`
- Docs: PRODUCT_CONTEXT, INVENTORY_LEDGER, DATA_DICTIONARY, ROADMAP, ARCHITECTURE

## 7. Assumptions

1. Patient tracing / external feeds / FDA integrations remain out of scope.
2. Corrective release of quarantined lots stays on existing lot status management (`inventory.lots.manage`).
3. Soft cancel/resolve only; no hard delete of recalls with attached lots.
4. Serials, FEFO, Nolt, Stripe, PandaDoc remain out of scope.

## Completion notes

Phase 3.4 adds recall records that identify lots, surface affected stock, and quarantine via existing lot status. Patient tracing and external recall feeds remain out of scope.
