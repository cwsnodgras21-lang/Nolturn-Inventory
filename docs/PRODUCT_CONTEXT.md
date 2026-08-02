# Product context

**Last reviewed:** 2026-08-02  
**Phase:** 3.5 — Reorder rules and restock planning

This document describes functionality that **exists today**. Planned work lives in [ROADMAP.md](./ROADMAP.md).

## Product purpose

Nolt Inventory is a multi-tenant inventory operations platform. Phase 3.5 adds deterministic reorder rules and restock planning on top of Phase 3.4 recalls, Phase 3.3 lots, Phase 3.2 purchasing, and Phase 3.1 counts.

## Tech stack

Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · Supabase Auth/Postgres/RLS · Vitest · Playwright · Zod

## Implemented domains

### Identity & tenancy (Phase 1)

Organizations, memberships, roles/permissions, locations (`all|restricted`), active organization resolution, audit foundation.

### Catalog (Phases 2.1–2.2)

Units, categories, items, variants, conversions, identifiers. Items include `tracking_mode` (`quantity` | `lot`).

### Storage (Phase 2.3)

Location-scoped storage areas and optional bins.

### Inventory ledger, movements, and reversals (Phases 2.4–2.6)

- Transaction headers/lines for movements + `reversal`
- Immutable ledger entries + rebuildable balances
- Negative-stock enforcement, draft location hardening, reverse RPC
- See [INVENTORY_LEDGER.md](./INVENTORY_LEDGER.md)

### Inventory counts (Phase 3.1)

- Count sessions, blind mode, frozen expected quantities, review, ledger reconciliation
- Count lines include optional `lot_id` for lot-tracked stock
- UI: `/inventory/counts`

### Purchasing foundation (Phase 3.2)

- Tenant-owned suppliers + contacts
- Purchase orders with ledger-backed receiving
- UI: `/purchasing`, `/purchasing/suppliers`, `/purchasing/orders`

### Lots and expiration (Phase 3.3)

- Item tracking mode, inventory lots, lot-aware ledger/balances
- Informational expiration views; quarantined lots blocked from movements
- UI: `/inventory/lots`

### Recall management (Phase 3.4)

- Recall records with number, source, severity, status, announced date, notes
- Recall ↔ lot attachments (same organization; no duplicates)
- Affected stock by location/area/bin (location-scoped for restricted members)
- One-click quarantine via existing `inventory_lots.status = quarantined`
- Resolve/cancel closes the recall without releasing quarantined lots
- Permissions `inventory.recalls.read` / `inventory.recalls.manage`
- UI: `/inventory/recalls`, `/inventory/recalls/new`, `/inventory/recalls/[id]`

### Reorder rules and restock planning (Phase 3.5)

- Item default reorder rules plus optional location overrides
- Minimum, target, optional fixed reorder quantity, preferred supplier
- Low-stock / out-of-stock restock suggestions from usable balances
- Draft purchase orders from selected suggestions (grouped by supplier + ship-to); never auto-submitted
- Idempotent restock request keys prevent duplicate POs on repeat clicks
- Permissions `inventory.reorder.read` / `inventory.reorder.manage`
- UI: item reorder panel, `/inventory/restock`

## Not implemented

Patient tracing/notifications, external recall feeds, FDA integrations, serials, automated FEFO, temperature monitoring, cycle-count scheduling, purchase requests/approvals, AP/payments, AI/Nolt recommendations, demand forecasting, automatic PO submission, modules, Stripe, PandaDoc.

## Navigation

Inventory is available with `inventory.read`. Purchasing with `purchasing.read`. Lots, recalls, restock, counts, and movements remain permission-gated. Nolt remains a planned placeholder.

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
