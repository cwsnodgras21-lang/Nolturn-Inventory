# Product context

**Last reviewed:** 2026-08-02  
**Phase:** 3.1 — Inventory counts

This document describes functionality that **exists today**. Planned work lives in [ROADMAP.md](./ROADMAP.md).

## Product purpose

Nolt Inventory is a multi-tenant inventory operations platform. Phase 3.1 adds physical inventory count sessions with frozen expected quantities, blind counting, review, and ledger-backed variance reconciliation on top of Phase 2 movements and reversals.

## Tech stack

Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · Supabase Auth/Postgres/RLS · Vitest · Playwright · Zod

## Implemented domains

### Identity & tenancy (Phase 1)

Organizations, memberships, roles/permissions, locations (`all|restricted`), active organization resolution, audit foundation.

### Catalog (Phases 2.1–2.2)

Units, categories, items, variants, conversions, identifiers.

### Storage (Phase 2.3)

Location-scoped storage areas and optional bins.

### Inventory ledger, movements, and reversals (Phases 2.4–2.6)

- Transaction headers/lines for movements + `reversal`
- Immutable ledger entries + rebuildable balances
- Negative-stock enforcement, draft location hardening, reverse RPC
- See [INVENTORY_LEDGER.md](./INVENTORY_LEDGER.md)

### Inventory counts (Phase 3.1)

- Count sessions assigned to one or more locations
- Count lines with expected quantity frozen at start
- Blind count mode (expected hidden from counters; visible to reviewers)
- Review workflow: accept / reject / return for correction
- Reconciliation posts `positive_adjustment` / `negative_adjustment` via `complete_inventory_transaction`
- Permissions `inventory.count.read` / `inventory.count.perform` / `inventory.count.review`
- UI: `/inventory/counts`, `/new`, `/[id]` (tablet-friendly entry)

## Not implemented

Lots, expiration, serials, cycle-count scheduling, procurement, modules, Stripe, PandaDoc, Nolt.

## Navigation

Inventory is available with `inventory.read`. Counts require `inventory.count.read`. Movement and reverse controls remain permission-gated. Purchasing / Nolt remain planned placeholders.

## Local setup

```bash
cp .env.example .env.local
npm install
npm run supabase:start
# copy keys from `npx supabase status -o env` into .env.local
npm run db:reset
npm run db:bootstrap
npm run dev
```

Demo password: `password123`

## Verification

```bash
npm run verify
npm run test:rls
npm run test:e2e
```

## Code map

- `src/modules/counts/` — count sessions, lines, review, reconciliation UI
- `src/modules/inventory/` — ledger domain + movement UI
- `docs/INVENTORY_LEDGER.md`, `docs/PHASE3_1_INSPECTION.md`
