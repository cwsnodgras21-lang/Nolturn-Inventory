# Phase 3.6 inspection

**Date:** 2026-08-02  
**Base:** Phase 3.5 reorder branch (`cursor/phase-3-5-reorder-restock-0495`) — not yet merged to `main`.

## 1. Phase 3.5 matches documentation

Yes. Reorder rules, usable-balance restock suggestions, draft PO idempotency, and `inventory.reorder.*` permissions are present on the Phase 3.5 branch. Lots/expiration, recalls/quarantine, purchasing `expected_date`, and count sessions are available from earlier phases.

## 2. Helpers to reuse

| Pattern | Reuse |
| --- | --- |
| `listRestockSuggestions` / `stockStateFor` / usable lot calc | Low / out of stock conditions |
| `listLots({ expiration })` windows | Expired / expiring-soon (30-day window) |
| `inventory_recalls` status `active` | Active recall alerts |
| `inventory_lots.status = quarantined` | Quarantine alerts |
| `purchase_orders.expected_date` + open statuses | Overdue POs |
| Permission seed/backfill | Mirror reorder: `alerts.read` / `alerts.manage` |
| `user_can_access_location` | Location-scoped alert SELECT/UPDATE |
| Audit `writeAuditEvent` | Acknowledge / resolve / sync events |

## 3. Architectural concerns

| Concern | Resolution |
| --- | --- |
| AI / Nolt | Deterministic sync only; no recommendations |
| Duplicate open alerts | Unique index on `(organization_id, condition_key)` where status in (`open`, `acknowledged`) |
| Idempotent generation | `sync_operational_alerts` upserts by `condition_key`; no-op when unchanged |
| Auto-resolve | Sync marks open/acknowledged alerts resolved when condition_key absent from current set |
| Duplicating domain math | Sync RPC mirrors documented Phase 3.5 / lots / recall / PO rules; does not invent new thresholds |
| Count overdue without due date | **Gap:** `count_sessions` has no `due_date`. Add optional `due_date`; alert when past due and not completed/cancelled |
| Purchasing Manager scope | Grant `alerts.read` + `alerts.manage` (same as inventory); no per-type RLS — simpler and covers PO alerts |
| Location Manager | `alerts.read` + `alerts.manage` with location RLS on `location_id` (null-location alerts visible org-wide to members with read) |
| Delivery channels | Out of scope — no email/SMS/push/schedulers |
| When sync runs | On `/alerts` load and after acknowledge/resolve; explicit Refresh action |

## 4. Alert types and sources (normative)

| Type | Condition | Entity | Location |
| --- | --- | --- | --- |
| `low_stock` | Restock usable qty below minimum (not ≤0) | item (+ variant) | yes |
| `out_of_stock` | Restock usable qty ≤ 0 with active rule | item (+ variant) | yes |
| `expiring_soon` | Lot `expiration_date` in `[today, today+30]` and status active; on-hand > 0 | lot | primary balance location if any |
| `expired_stock` | Lot past expiration (date &lt; today) or status `expired`; on-hand > 0 preferred | lot | yes when known |
| `active_recall` | Recall status = `active` | recall | null |
| `quarantined_inventory` | Lot status = `quarantined` | lot | yes when known |
| `overdue_count` | `due_date < today` and status not `completed`/`cancelled` | count_session | first assigned location if any |
| `overdue_purchase_order` | `expected_date < today` and status in `submitted`/`partially_received` | purchase_order | ship_to |

**Severity defaults:** out/expired/quarantine → `high`; active_recall → map recall severity (critical/high/medium…); low/expiring/overdue → `medium`.

**Condition key:** `{type}:{entity_type}:{entity_id}:{location_id|none}` — stable for idempotency.

## 5. Decisions

| Topic | Decision |
| --- | --- |
| Table | `operational_alerts` |
| Statuses | `open`, `acknowledged`, `resolved` |
| Sync | `public.sync_operational_alerts()` SECURITY DEFINER; requires `alerts.manage` |
| Count due date | Optional `count_sessions.due_date` |
| Expiring window | 30 days (matches lots filter) |
| Null location alerts | Visible to any member with `alerts.read` |
| Manual resolve | Allowed; if condition persists, next sync recreates a new open alert |
| Permissions | `alerts.read`, `alerts.manage` |
| Nav | `/alerts` + open-count badge |

## 6. Migration sequence

1. `phase3_6_alert_permissions`  
2. `phase3_6_operational_alerts` — table, count `due_date`, sync RPC, RLS  

## 7. Expected file changes

- Migrations, permission catalog, `appConfig.phase = 3.6`
- `src/modules/alerts/` + `/alerts` route + sidebar badge
- Count create/edit accepts optional due date
- `supabase/tests/rls.alerts.test.ts`
- Docs: PRODUCT_CONTEXT, DATA_DICTIONARY, ROADMAP, ARCHITECTURE

## 8. Assumptions

1. Branch builds on Phase 3.5 so low/out stock alerts can use reorder rules.
2. No scheduled job — sync is request-driven.
3. Email/SMS/push/Nolt remain out of scope.

## Completion notes

Phase 3.6 adds deterministic operational alerts synced from existing domain conditions. No email/SMS/push, schedulers, Nolt, or forecasting.

Verified: `db:reset`, `db:bootstrap`, `verify`, `test:rls` (118), `test:e2e` (15).
