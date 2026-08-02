# Phase 3.5 inspection

**Date:** 2026-08-02

## 1. Phase 3.4 matches documentation

Yes. Recalls quarantine via `inventory_lots.status`; resolve does not release lots. Purchasing draft PO create/line insert paths are stable. Balances include optional `lot_id` with lot number/expiration joins.

## 2. Helpers to reuse

| Pattern | Reuse |
| --- | --- |
| `inventory_balances` + `inventory_lots` | Available qty (filter usable lots) |
| `createPurchaseOrderAction` / line insert | Draft POs from restock selections |
| `listSuppliers({ status: "active" })` | Preferred supplier picker |
| Permission seed/backfill | Mirror recalls: `inventory.reorder.read` / `manage` |
| `UNIQUE NULLS NOT DISTINCT` | Default vs location-specific rules |
| Location access via `TenantContext` | Filter restock rows for restricted members |

## 3. Architectural concerns

| Concern | Resolution |
| --- | --- |
| AI / forecasting | Deterministic rules only; no Nolt |
| Auto-submit PO | Draft only; user submits later |
| Duplicate click → duplicate POs | `restock_plan_requests` unique `(organization_id, request_key)` + linked PO ids |
| Available qty for lots | Sum balances where lot is usable: `status = active` and not past expiration date |
| Quarantined / expired | Excluded from available; depleted excluded via non-active status |
| Location override | Prefer rule with matching `location_id`; else default (`location_id` null) |
| Org-wide default evaluation | Emit one suggestion per accessible location that has stock or an override, using effective rule |
| Fixed reorder qty | When `reorder_quantity` set, suggested = that value (when below minimum) |
| Target fill | Else suggested = `max(0, target - available)` |
| Purchasing permission | Restock PO create requires `purchasing.manage` + `inventory.reorder.manage` |

## 4. Calculation rules (normative)

1. **Effective rule** for `(item, variant, location)`: location-specific active rule if present, else active default rule (`location_id` is null). No rule → no suggestion.
2. **Available quantity** at a location: sum of `inventory_balances.quantity_on_hand` where:
   - dims match item/variant/location
   - if `lot_id` is null (quantity-tracked): include
   - if lot-tracked: include only when lot `status = 'active'` and (`expiration_date` is null or `expiration_date >= current_date`)
3. **State:** `available <= 0` → out of stock; `0 < available < minimum` → low stock; else OK.
4. **Suggested qty** when low/out: if `reorder_quantity` is not null → that value; else `max(0, target_quantity - available)`.

## 5. Decisions

| Topic | Decision |
| --- | --- |
| Table | `reorder_rules` |
| Idempotency | `restock_plan_requests` + `restock_plan_request_orders` |
| Status | `active` / `inactive` |
| Constraints | `minimum >= 0`, `target >= minimum`, optional `reorder_quantity > 0` |
| Preferred supplier | FK `suppliers`, org-matched by trigger |
| PO unit | Item `default_entry_unit_id` |
| Permissions | `inventory.reorder.read` / `inventory.reorder.manage` |

## 6. Migration sequence

1. `phase3_5_reorder_permissions`  
2. `phase3_5_reorder_rules` — rules + restock request tables + RLS  

## 7. Expected file changes

- Migrations, permission catalog, `appConfig.phase = 3.5`
- `src/modules/reorder/` + inventory restock routes + item detail panel
- `supabase/tests/rls.reorder.test.ts`
- Docs: PRODUCT_CONTEXT, DATA_DICTIONARY, ROADMAP, ARCHITECTURE, INVENTORY_LEDGER (availability)

## 8. Assumptions

1. Suggestions are location-scoped using the effective rule at each accessible location.
2. Selections without preferred supplier are grouped under a single “unassigned” draft that still requires a supplier pick at create time — or blocked until supplier set. **Decision:** require preferred supplier (or explicit supplier on selection) before draft PO creation; block lines without supplier.
3. Nolt, forecasting, auto-submit remain out of scope.

## Completion notes

Phase 3.5 adds deterministic reorder rules and restock planning that create draft POs only. No AI, auto-submit, or forecasting.
