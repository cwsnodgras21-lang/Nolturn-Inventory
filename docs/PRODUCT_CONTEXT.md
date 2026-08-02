# Product context

**Last reviewed:** 2026-08-02  
**Phase:** 3.2 — Purchasing foundation

This document describes functionality that **exists today**. Planned work lives in [ROADMAP.md](./ROADMAP.md).

## Product purpose

Nolt Inventory is a multi-tenant inventory operations platform. Phase 3.2 adds suppliers and purchase orders with ledger-backed receiving on top of Phase 3.1 counts and Phase 2 movements.

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

- Count sessions, blind mode, frozen expected quantities, review, ledger reconciliation
- UI: `/inventory/counts`

### Purchasing foundation (Phase 3.2)

- Tenant-owned suppliers + contacts (soft `active`/`inactive`)
- Purchase orders and lines with frozen purchase-unit → base conversion
- Statuses: draft → submitted → partially_received → received (or cancelled)
- Receiving posts normal `receipt` transactions via `complete_inventory_transaction`
- Partial receipts, remaining quantity tracking, over-receipt rejection
- Permissions `purchasing.read` / `purchasing.manage` / `purchasing.receive`
- UI: `/purchasing`, `/purchasing/suppliers`, `/purchasing/orders`

## Not implemented

Lots, expiration, serials, cycle-count scheduling, purchase requests/approvals, AP/payments, automated reordering, modules, Stripe, PandaDoc, Nolt.

## Navigation

Inventory is available with `inventory.read`. Purchasing is available with `purchasing.read`. Counts, movements, and reverse controls remain permission-gated. Nolt remains a planned placeholder.

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

- `src/modules/suppliers/` — suppliers + contacts
- `src/modules/procurement/` — purchase orders + receiving
- `src/modules/counts/` — count sessions, lines, review, reconciliation UI
- `src/modules/inventory/` — ledger domain + movement UI
