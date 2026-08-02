# Architecture

**Last reviewed:** 2026-08-02  
**Phase:** 3.2 — Purchasing foundation

## Intent

Nolt Inventory is a **modular monolith**: one Next.js deployable with explicit domain modules, a shared Supabase Postgres schema, and tenant isolation enforced by Row Level Security.

## Catalog (Phases 2.1–2.2)

Tenant-owned catalog under `src/modules/catalog/`. Item conversions resolve directly to each item’s base unit.

## Storage (Phase 2.3)

Physical hierarchy under `src/modules/storage/`, location-scoped via `requireLocationAccess` / `user_can_access_location`.

## Inventory ledger, movements, and reversals (Phases 2.4–2.6)

Domain under `src/modules/inventory/`. Quantities come from immutable `inventory_ledger_entries`. Balances are projections.

- **Completion:** `complete_inventory_transaction` posts draft movements atomically (type-specific permission, sides, negative-stock, transfer dual posting).
- **Reversal:** `reverse_inventory_transaction` creates a linked completed `reversal` that posts exact inverse ledger rows using stored original quantities (no conversion recalculation).
- **Hardening:** draft line RLS requires accessible locations; tenants cannot invent reversal headers or alter link columns; reconcile/rebuild are adjust-gated.

Details: [INVENTORY_LEDGER.md](./INVENTORY_LEDGER.md).

## Inventory counts (Phase 3.1)

Domain under `src/modules/counts/`. Physical counts freeze expected quantities and reconcile variances as normal ± adjustments through the ledger completion pipeline.

## Purchasing foundation (Phase 3.2)

Domains under `src/modules/suppliers/` and `src/modules/procurement/`.

- Suppliers are tenant-owned with soft status.
- Purchase orders track ordered/received/remaining in purchase units with a frozen conversion multiplier.
- `receive_purchase_order` creates a normal inventory `receipt`, calls `complete_inventory_transaction`, then updates PO line quantities and status atomically.
- No second receiving engine; no direct balance edits.

## Lots and expiration (Phase 3.3)

Domain under `src/modules/lots/`. Lot tracking extends the existing ledger dimensions rather than adding a second inventory engine.

- Items choose `tracking_mode` (`quantity` or `lot`).
- Optional `lot_id` threads through transaction lines, ledger entries, balances, and count lines.
- Completion, reverse, count reconcile, and PO receive reuse the same posting helpers with lot dims.
- Expiration filters are informational; quarantine/non-active status blocks movements.

## Recall management (Phase 3.4)

Domain under `src/modules/recalls/`. Recalls identify affected lots and quarantine them via the existing lot status model.

- Recall headers + recall-lot links; no second quarantine mechanism.
- `quarantine_recall_lots` updates linked lots to `quarantined`.
- Resolve/cancel closes the recall record without releasing quarantined stock.
- Affected stock views honor restricted location access.

## Reorder rules and restock planning (Phase 3.5)

Domain under `src/modules/reorder/`. Deterministic monitoring only — no AI, forecasting, or automatic PO submission.

- `reorder_rules`: default item rule (`location_id` null) and optional location overrides.
- Restock suggestions compare usable available quantity to minimum/target (or fixed reorder qty).
- Usable stock excludes quarantined/non-active lots and past-expiration lots.
- Draft POs reuse the purchasing model; `restock_plan_requests` provides click idempotency.
- Location-restricted members only see/manage location rules and suggestions for accessible locations.

## Operational alerts (Phase 3.6)

Domain under `src/modules/alerts/`. Request-driven sync — no delivery channels or schedulers.

- `operational_alerts` stores open/acknowledged/resolved conditions with stable `condition_key`.
- `sync_operational_alerts(organization_id)` mirrors existing reorder, lot, recall, count, and PO rules.
- Duplicate open alerts blocked by partial unique index; cleared conditions auto-resolve.
- Location-scoped SELECT/UPDATE; null-location alerts (e.g. active recalls) visible org-wide to readers.
- Optional `count_sessions.due_date` enables overdue count alerts without inventing schedule heuristics.

## Assumptions

1. Shared schema multi-tenancy with `organization_id` ownership.
2. Supabase Auth + SSR cookie clients (`@supabase/ssr`).
3. Session refresh via `src/proxy.ts`; authorization via server helpers.
4. Service-role is server-only for bootstrap and trusted jobs.
5. Domain modules own types, validation, queries, commands, and domain UI.
6. Active organization cookie is a candidate only — membership is revalidated every request.
7. Location-scoped inventory data must not leak across restricted locations.
8. Ledger is source of truth; corrections use compensating reversals (ADR-0004), never silent edits.
9. Debits (including reverse inverse debits) enforce `allow_negative_stock` at exact balance dimensions under row locks.

## Request path

```text
Browser → proxy.ts (session refresh)
       → Server Component / Server Action
           → requireUser / requireTenantContext / requirePermission [/ requireLocationAccess]
           → domain module
           → Supabase user-scoped client (RLS)
           → complete_inventory_transaction or reverse_inventory_transaction RPC
```

## Related docs

- [INVENTORY_LEDGER.md](./INVENTORY_LEDGER.md)
- [SECURITY_MODEL.md](./SECURITY_MODEL.md)
- [TENANCY_MODEL.md](./TENANCY_MODEL.md)
- [CATALOG_MODEL.md](./CATALOG_MODEL.md)
- [DATA_DICTIONARY.md](./DATA_DICTIONARY.md)
- [PHASE2_6_INSPECTION.md](./PHASE2_6_INSPECTION.md)
