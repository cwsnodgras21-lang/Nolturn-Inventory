# Product context

**Last reviewed:** 2026-08-02  
**Phase:** 2.6 — Reversals and ledger hardening

This document describes functionality that **exists today**. Planned work lives in [ROADMAP.md](./ROADMAP.md).

## Product purpose

Nolt Inventory is a multi-tenant inventory operations platform. Phase 2.6 completes Phase 2 inventory operations with transaction reversals, draft location hardening, and ledger reconciliation on top of the immutable ledger and core movements.

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

- Transaction headers/lines for `opening_balance`, `positive_adjustment`, `negative_adjustment`, `receipt`, `consumption`, `transfer`, `reversal`
- Immutable ledger entries (`effect_role` for transfer source/destination) + rebuildable balances
- Negative-stock enforcement at exact storage dimensions (including reverse inverse debits)
- Bidirectional original/reversal links; one reversal per completed original
- Draft creation/update rejects inaccessible source/destination locations
- Reconciliation RPC compares balances to ledger sums; rebuild remains an adjust-gated recovery tool
- Permissions `inventory.read` / `inventory.adjust` / `inventory.receive` / `inventory.consume` / `inventory.transfer` / `inventory.reverse`
- UI: stock, history/filters, movement workspaces, reverse action with reason and linked status
- See [INVENTORY_LEDGER.md](./INVENTORY_LEDGER.md)

## Not implemented

Lots, expiration, counts, procurement, modules, Stripe, PandaDoc, Nolt.

## Navigation

Inventory is available with `inventory.read`. Movement routes require their type-specific permissions. Reverse controls require `inventory.reverse` and appear on eligible completed transaction detail pages. Administration still hosts catalog and storage. Purchasing / Nolt remain planned placeholders.

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

Bootstrap seeds catalog, storage, and a completed opening balance (IPA + Medium gloves) per primary location.

## Verification

```bash
npm run verify
npm run test:rls
npm run test:e2e
```

## Code map

- `src/modules/inventory/` — ledger domain + movement/reversal UI
- `src/modules/catalog/`, `src/modules/storage/`
- `docs/INVENTORY_LEDGER.md`, `docs/PHASE2_6_INSPECTION.md`
