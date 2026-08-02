# Phase 3.1 inspection

**Date:** 2026-08-02

## 1. Phase 2 matches documentation

Yes. Phase 2.6 closed inventory operations: movements, reversals, draft location hardening, reconcile/rebuild, RLS tests, and docs. Counts remain stubbed (`src/modules/counts/index.ts` → `MODULE_STATUS = "stub"`). No count tables, permissions, or routes exist.

## 2. Helpers to reuse

| Helper | Reuse |
| --- | --- |
| `complete_inventory_transaction` | Post variance adjustments (positive/negative) — no parallel posting path |
| `inventory_balances` read at start | Freeze `expected_quantity` onto count lines |
| `requirePermission` / `requireLocationAccess` | Count commands + location assignment |
| `private.user_can_access_location` / `user_has_permission` | RLS + security-definer RPCs |
| `writeAuditEvent` / `AUDIT_ACTIONS` | Count lifecycle audit keys |
| Movement UI / inventory routes | Tablet-oriented count workspaces under `/inventory/counts` |
| Permission seed pattern (Phase 2.6) | Insert keys → replace `seed_system_roles` → backfill |

## 3. Architectural concerns

| Concern | Resolution |
| --- | --- |
| Must not edit balances directly | Reconciliation only creates `positive_adjustment` / `negative_adjustment` drafts and calls `complete_inventory_transaction` |
| Frozen expected vs live stock | Snapshot `quantity_on_hand` into `count_lines.expected_quantity` on start; never update afterward |
| Blind count leakage | Expected quantity omitted from perform queries/UI unless actor has `inventory.count.review` or session is past perform (`ready_for_review` / `completed`) |
| Negative variance stock rules | Negative adjustments use existing debit asserts; approve fails controlled if stock insufficient — session stays `ready_for_review` |
| Who may approve | Requires `inventory.count.review` + location access; completion RPC also needs `inventory.adjust` (already on Owner/Admin/Inventory Manager/Location Manager) |
| Duplicate completion | Session `FOR UPDATE` + status guard `ready_for_review` → `completed` |
| Zero balances / missing SKUs | Start snapshots existing balances; performers may add lines with expected `0` for dimensions not yet stocked |
| Location Manager scope | Assigned locations ∩ accessible locations; cannot assign or count inaccessible locations |
| Lots / expiration | Out of scope; count lines are item/variant/location/area/bin only |
| `count_sessions` SELECT helper recursion | Do not call a helper that re-queries `count_sessions` from the SELECT policy — `INSERT…RETURNING` fails with 42501. Inline location scoping on the policy instead. |

## 4. Decisions

| Topic | Decision |
| --- | --- |
| Session statuses | `draft` → `in_progress` → `ready_for_review` → `completed`; also `cancelled` from draft/in_progress |
| Line statuses | `pending` → `counted` → `accepted` \| `rejected`; return session resets accepted/rejected back to `counted` for re-edit |
| Start | Creates lines from balances in assigned locations; freezes expected; sets `started_by` / `started_at` |
| Blind | Boolean on session; perform UI/API hides expected for non-reviewers while `in_progress` |
| Review | Per-line accept/reject; return whole session to `in_progress`; approve posts adjustments then completes |
| Adjustments | One `positive_adjustment` for all accepted +variances; one `negative_adjustment` for all accepted −variances; notes cite count session; `count_lines.reconciliation_transaction_id` links |
| Permissions | `inventory.count.read` / `perform` / `review` with role map in product brief |
| ADR | No supersede; ADR-0004 — variances are compensating adjustments |

## 5. Migration sequence

1. `phase3_1_inventory_count_permissions` — permissions + role seed/backfill  
2. `phase3_1_inventory_counts` — tables, RLS, start/submit/return/review/approve RPCs  

## 6. Expected file changes

- Migrations + `PERMISSION_KEYS` + `appConfig.phase = 3.1`
- `src/modules/counts/` domain (replace stub)
- Audit keys for count lifecycle
- Routes `/inventory/counts`, `/new`, `/[id]`
- `supabase/tests/rls.counts.test.ts` (+ e2e smoke phase label)
- Docs: PRODUCT_CONTEXT, INVENTORY_LEDGER, DATA_DICTIONARY, ROADMAP

## 7. Assumptions

1. Count quantities are in item base units (same as balances/ledger).
2. Submit for review requires every line to have a counted quantity.
3. Approve requires every counted line to be accepted or rejected; only accepted non-zero variances post.
4. Cancelled/completed sessions are immutable.
5. Purchasing Manager does not receive count permissions (not in suggested defaults).

## Completion notes

Phase 3.1 delivers count sessions with blind mode, frozen expected quantities, review, and ledger-backed reconciliation. Lots, expiration, serials, cycle scheduling, and purchasing remain out of scope.

### Delivered checklist

- [x] Inspection recorded
- [x] Migrations: count permissions, sessions/lines, RPCs, RLS
- [x] Domain layer + audit events
- [x] Count UI (list / new / detail)
- [x] RLS tests + e2e smoke phase label
- [x] `verify` / `test:rls` (80) / `test:e2e` (10) passing after INSERT…RETURNING RLS fix
- [x] Docs updated to Phase 3.1
