# Product context

**Last reviewed:** 2026-08-02  
**Phase:** Productization 1 — Customer onboarding (inventory core through 3.6)

This document describes functionality that **exists today**. Planned work lives in [ROADMAP.md](./ROADMAP.md). Release readiness notes: [V1_RELEASE_REVIEW.md](./V1_RELEASE_REVIEW.md). Onboarding details: [ONBOARDING.md](./ONBOARDING.md).

## Product purpose

Nolt Inventory is a multi-tenant inventory operations platform. The inventory core (through Phase 3.6) plus Productization 1 guided onboarding lets a new customer organization become usable without developer intervention.

## Tech stack

Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · Supabase Auth/Postgres/RLS · Vitest · Playwright · Zod

## Implemented domains

### Identity & tenancy (Phase 1)

Organizations, memberships, roles/permissions, locations (`all|restricted`), active organization resolution, audit foundation.

### Customer onboarding (Productization 1)

- Guided multi-step wizard (`/onboarding`) with resumable progress
- Organization branding (display name, logo via private storage, timezone, date format, currency, contact)
- Primary location setup, optional team invitations, starter packs, optional CSV item import
- Module enablement foundation (`module_definitions` / `organization_modules`) — no billing enforcement
- Dashboard setup progress and first recommended actions (no fake KPIs)
- See [ONBOARDING.md](./ONBOARDING.md)

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

### Operational alerts (Phase 3.6)

- Centralized alerts for low/out stock, expiring/expired lots, active recalls, quarantine, overdue counts, overdue POs
- Idempotent sync (`sync_operational_alerts`); auto-resolve when conditions clear; history retained
- Acknowledge / manual resolve; location-scoped visibility
- Optional `count_sessions.due_date` for overdue count alerts
- Permissions `alerts.read` / `alerts.manage`
- UI: `/alerts` with nav badge

## Not implemented

Patient tracing, production invitation email delivery, email/SMS/push alert delivery, scheduled alert jobs, external recall feeds, FDA integrations, serials, automated FEFO, temperature monitoring, cycle-count scheduling, purchase requests/approvals, AP/payments, AI/Nolt recommendations, demand forecasting, automatic PO submission, Stripe billing enforcement, PandaDoc, full module runtime enforcement beyond configuration groundwork.

## Navigation

Setup (`/onboarding`) with `organization.read` / `organization.manage`. Inventory with `inventory.read`. Purchasing with `purchasing.read`. Alerts with `alerts.read` (open-count badge in nav). Lots, recalls, restock, counts, and movements remain permission-gated. Nolt remains a planned placeholder.

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
