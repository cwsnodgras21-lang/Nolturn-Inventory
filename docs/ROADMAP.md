# Roadmap

**Last reviewed:** 2026-08-02

Unimplemented work only. Implemented behavior belongs in PRODUCT_CONTEXT.md.

## Phase 0 — Repository foundation

- [x] Next.js 16 + React 19 + TypeScript strict + Tailwind v4
- [x] Supabase local configuration
- [x] Vitest + Playwright + ESLint + Prettier
- [x] CI verification workflow
- [x] Documentation structure + foundational ADRs
- [x] Branded application shell + honest placeholder routes
- [x] Verification green (typecheck, lint, unit tests, build, smoke e2e)

## Phase 1 — Identity and tenancy

- [x] Authentication (Supabase Auth SSR)
- [x] Organizations, memberships, active organization
- [x] Locations
- [x] Roles and permissions
- [x] Tenant context resolution
- [x] RLS policies + isolation tests
- [x] Audit foundation
- [ ] Invitation email delivery (deferred)
- [ ] Full support-access workflow (deferred; ADR-0012)

## Phase 2.1 — Catalog primitives

- [x] `catalog.read` / `catalog.manage` permissions + role mappings
- [x] Units of measure (tenant-owned)
- [x] Item categories + hierarchy + cycle prevention
- [x] RLS + integrity tests
- [x] Admin UI for units and categories
- [x] Bootstrap demo units/categories
- [x] CATALOG_MODEL.md + conversion contract (no table yet)

## Phase 2.2 — Items, variants, and identifiers

- [x] Items, base units, default entry units
- [x] Item-specific unit conversions (direct to base)
- [x] Variants, SKUs, barcode-ready identifiers
- [x] Catalog search/filtering + item CRUD UI
- [x] RLS, audit, integrity tests, bootstrap samples

## Phase 2.3 — Storage hierarchy

- [x] Storage areas + nested hierarchy + cycle prevention
- [x] Optional storage bins
- [x] `inventory.storage.read` / `inventory.storage.manage` + location-scoped RLS
- [x] Storage management UI
- [x] Bootstrap sample storage + integrity/RLS tests

## Phase 2.4 — Inventory ledger foundation

- [x] Transaction headers/lines + immutable ledger entries
- [x] Rebuildable balances + concurrency-safe numbering
- [x] Positive adjustment / opening balance completion workflow
- [x] `inventory.read` / `inventory.adjust` + location-scoped RLS
- [x] Minimal stock/transaction UI + ledger tests/docs

## Phase 2.5 — Core inventory movements

- [x] Receipt / consumption / negative adjustment / transfer types
- [x] Source + destination line dimensions; transfer dual ledger posting
- [x] Negative-stock enforcement at exact balance dimensions
- [x] `inventory.receive` / `inventory.consume` / `inventory.transfer` + role mappings
- [x] Movement UI workspaces + stock/history filters
- [x] Extended RLS/ledger tests + docs

## Phase 2 (remaining) — Inventory operations

- Reversals
- Inventory history polish

## Phase 3 — Counts, lots, and expiration

- Lots, expiration, serial tracking contract
- Count sessions, assignments, reconciliation
- Variance approval
- Expiration alerts
- Mobile-friendly count UX

## Phase 4 — Procurement

- Suppliers
- Purchase requests and orders
- Approval workflow
- Receiving against POs (partial/full)
- Cost history
- Accounting integration boundary only (no full AP)

## Phase 5 — Module framework

- Module registry and activation
- Settings, dependencies, permissions
- Navigation and dashboard contributions
- Server-side module enforcement
- Register `industry.clinic` contract

## Phase 6 — Clinic module MVP

- Procedure / supply kits
- Room stocking
- Lot and expiration workflows
- Recall lookup
- Waste tracking
- Clinic-focused dashboards
- No patient data in initial release

## Phase 7 — Nolt foundation

- Capability registry, providers, prompt versioning
- Authorized read tools + execution audit
- Recommendation UI
- Initial capabilities: reorder, stockout risk, expiration risk, summary, data quality
- Read-only posture

## Phase 8 — Billing and entitlements

- Stripe customer/subscription sync via verified webhooks
- Plans, entitlements, trials, grace periods
- Seat/location/module limits
- Billing UI + enforcement

## Phase 9 — PandaDoc and integrations

- PandaDoc adapter, document linking, status sync
- Verified webhooks
- Integration settings and health

## Phase 10 — Production readiness

- Onboarding wizard, demo org, imports/exports
- Notifications, observability, error tracking
- Security / accessibility / performance reviews
- Backup/restore and retention documentation
- Production deployment checklist

## Explicit non-goals (near term)

- Full accounts payable / general ledger
- Competing document editor vs PandaDoc
- Autonomous Nolt mutations without approval
- Claiming HIPAA compliance without dedicated review
- PHI in core inventory platform
- Per-customer application forks
