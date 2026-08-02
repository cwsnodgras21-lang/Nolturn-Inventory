# Product context

**Last reviewed:** 2026-08-02  
**Phase:** 2.4 — Inventory ledger foundation

This document describes functionality that **exists today**. Planned work lives in [ROADMAP.md](./ROADMAP.md).

## Product purpose

Nolt Inventory is a multi-tenant inventory operations platform. Phase 2.4 establishes the immutable inventory ledger with opening balances and positive adjustments on top of catalog and storage.

## Tech stack

Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · Supabase Auth/Postgres/RLS · Vitest · Playwright · Zod

## Implemented domains

### Identity & tenancy (Phase 1)

Organizations, memberships, roles/permissions, locations (`all|restricted`), active organization resolution, audit foundation.

### Catalog (Phases 2.1–2.2)

Units, categories, items, variants, conversions, identifiers.

### Storage (Phase 2.3)

Location-scoped storage areas and optional bins.

### Inventory ledger (Phase 2.4)

- Transaction headers/lines for `opening_balance` and `positive_adjustment`
- Immutable ledger entries + rebuildable balances
- Permissions `inventory.read` / `inventory.adjust`
- UI: current stock, transaction history, create/complete draft adjustments
- See [INVENTORY_LEDGER.md](./INVENTORY_LEDGER.md)

## Not implemented

Receipts, consumption, negative adjustments, transfers, reversals, lots, expiration, counts, procurement, modules, Stripe, PandaDoc, Nolt.

## Navigation

Inventory is available with `inventory.read`. Administration still hosts catalog and storage. Purchasing / Nolt remain planned placeholders.

## Local setup

```bash
cp .env.example .env.local
npm install
npm run supabase:start
npm run db:reset
npm run db:bootstrap
npm run dev
```

Demo password: `password123`

Bootstrap seeds catalog, storage, and a completed opening balance (IPA + Medium gloves) per primary location.

## Verification

```bash
npm run verify
npm run test:rls
npm run test:e2e
```

## Code map

- `src/modules/inventory/` — ledger domain + UI
- `src/modules/catalog/`, `src/modules/storage/`
- `docs/INVENTORY_LEDGER.md`, `docs/PHASE2_4_INSPECTION.md`
