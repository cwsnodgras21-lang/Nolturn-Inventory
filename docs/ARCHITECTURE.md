# Architecture

**Last reviewed:** 2026-08-02  
**Phase:** 2.6 — Reversals and ledger hardening

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
