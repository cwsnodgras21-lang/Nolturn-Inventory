# Architecture

**Last reviewed:** 2026-08-02  
**Phase:** 2.4 — Inventory ledger foundation

## Intent

Nolt Inventory is a **modular monolith**: one Next.js deployable with explicit domain modules, a shared Supabase Postgres schema, and tenant isolation enforced by Row Level Security.

## Catalog (Phases 2.1–2.2)

Tenant-owned catalog under `src/modules/catalog/`. Item conversions resolve directly to each item’s base unit.

## Storage (Phase 2.3)

Physical hierarchy under `src/modules/storage/`, location-scoped via `requireLocationAccess` / `user_can_access_location`.

## Inventory ledger (Phase 2.4)

Domain under `src/modules/inventory/`. Quantities come from immutable `inventory_ledger_entries`. Balances are projections. Completion is an atomic security-definer RPC. Details: [INVENTORY_LEDGER.md](./INVENTORY_LEDGER.md).

## Assumptions

1. Shared schema multi-tenancy with `organization_id` ownership.
2. Supabase Auth + SSR cookie clients (`@supabase/ssr`).
3. Session refresh via `src/proxy.ts`; authorization via server helpers.
4. Service-role is server-only for bootstrap and trusted jobs.
5. Domain modules own types, validation, queries, commands, and domain UI.
6. Active organization cookie is a candidate only — membership is revalidated every request.
7. Location-scoped inventory data must not leak across restricted locations.
8. Ledger is source of truth; never silent-edit completed stock movements (ADR-0004).

## Request path

```text
Browser → proxy.ts (session refresh)
       → Server Component / Server Action
           → requireUser / requireTenantContext / requirePermission [/ requireLocationAccess]
           → domain module
           → Supabase user-scoped client (RLS)
           → complete_inventory_transaction RPC when posting stock
```

## Related docs

- [INVENTORY_LEDGER.md](./INVENTORY_LEDGER.md)
- [SECURITY_MODEL.md](./SECURITY_MODEL.md)
- [TENANCY_MODEL.md](./TENANCY_MODEL.md)
- [CATALOG_MODEL.md](./CATALOG_MODEL.md)
- [DATA_DICTIONARY.md](./DATA_DICTIONARY.md)
- [PHASE2_4_INSPECTION.md](./PHASE2_4_INSPECTION.md)
