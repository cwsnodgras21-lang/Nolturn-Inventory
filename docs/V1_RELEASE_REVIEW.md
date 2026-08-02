# Nolt Inventory — Version 1.0 Release Candidate Review

**Date:** 2026-08-02  
**Scope:** Phases 1–3.6 as shipped (identity through operational alerts)  
**Branch basis:** Phase 3.6 operational alerts (includes Phase 3.5 reorder)

This review documents architecture, security, performance, UX, and tech debt for the first customer-ready release. It does **not** introduce major new capabilities.

---

## Overall architecture score

**8.0 / 10** — Solid modular monolith with clear domain boundaries, RLS-first tenancy, and an immutable ledger. Ready for a careful first deployment with the caveats below.

| Area | Score | Notes |
| --- | --- | --- |
| Tenancy & auth | 8.5 | Cookie candidate + membership revalidation; location modes work |
| Ledger integrity | 9.0 | Immutable entries, completion/reverse RPCs, rebuild/reconcile |
| Permissions & RLS | 8.0 | Full table RLS; a few RPC location gaps closed in V1 RC |
| Domain modules | 8.0 | Consistent query/command/UI pattern through Phase 3.6 |
| UI consistency | 6.5 | Shared Button/Badge only; forms/tables hand-rolled |
| Docs accuracy | 8.0 | Aligned to 3.6 / V1 RC in this pass |
| Observability | 5.0 | Audit events strong; no metrics/tracing/alerting delivery |
| Extensibility | 7.0 | Stub modules for billing/Nolt/docs; registry still Phase 5 |

---

## Architectural observations

1. **Modular monolith works.** Domains under `src/modules/*` own types, Zod schemas, queries, commands, and UI. App Router pages stay thin.
2. **Ledger is the quantity source of truth.** Balances are projections; counts and purchasing receive through the same completion pipeline.
3. **Deterministic ops before intelligence.** Reorder and alerts reuse domain rules; Nolt remains planned (Phase 7).
4. **Permission seed rewrite pattern** (each phase replaces `seed_system_roles`) is correct for greenfield orgs but is migration-order sensitive — document for operators.
5. **Hand-maintained `types.ts`** drifts from schema unless updated with migrations — acceptable for V1; codegen later.
6. **Phase 3.5/3.6 not yet on `main` at review time** — V1 RC branch stacks them; merge order must be 3.5 → 3.6 → V1 RC.

---

## Security summary

**Ready for first deployment with defense-in-depth hardening applied in V1 RC.**

### Verified OK

- All **38** public application tables have RLS enabled
- Service-role client is `server-only`; used for bootstrap/tests, not Client Components
- Permission catalog matches seeded keys (`app.test.ts`)
- Mutating SECURITY DEFINER RPCs check `user_has_permission`
- Important product mutations write audit events (catalog, storage, inventory, counts, purchasing, lots, recalls, reorder, alerts)

### Hardened in V1 RC

- `cancel_purchase_order` now requires ship-to location access
- `submit_count_session_for_review` / `return_count_session_for_correction` require access to assigned locations
- FORCE RLS enabled on Phase 3+ tables (parity with earlier domains)

### Remaining observations (deferred, not blockers)

| Item | Severity | Note |
| --- | --- | --- |
| Membership/role UI mutations unaudited | Medium | No admin UI for grants yet; direct API possible with manage perms |
| Org update audit | Low | Added in V1 RC polish |
| Private schema EXECUTE hygiene | Low | Not exposed via PostgREST (`public` only) |
| `audit_events` insert by any member | Low | Can append own events; not a privilege escalation |
| Sign-in/out audit constants unused | Low | Nice-to-have |

---

## Performance summary

**Adequate for early tenants; no premature optimization required.**

| Topic | Status |
| --- | --- |
| Indexes | Present on org/status/foreign-key hot paths for ledger, counts, POs, lots, alerts |
| N+1 | Occasional enrichment queries (lot qty, alert sync) are bounded; acceptable at V1 scale |
| Alert sync | Request-driven on `/alerts` for managers — fine until large catalogs need a job |
| Permission checks | Repeated `requirePermission` per query is intentional and cheap |
| Client rendering | Mostly RSC; client islands for forms/workspaces |
| Layout alert count | Extra SELECT per authenticated layout — cheap; cache later if needed |

**Obvious wins deferred:** shared list caches, alert sync debounce, React Compiler already assumed — no new memoization added.

---

## UX summary

**Functional and coherent at domain level; visual system is still minimal.**

### Strengths

- Clear section pages with Badge + title + short description
- Permission-gated navigation
- Workspaces for counts, POs, movements, recalls, restock, alerts
- Empty table rows with guidance copy

### Gaps (mostly deferred)

- No shared `EmptyState` / `AlertMessage` / form field primitives
- No route-level `loading.tsx` / `error.tsx`
- Success/error message color inconsistent (`text-accent` vs `text-muted`)
- Pending button labels inconsistent (`Saving…` vs static disabled)
- Permission denials silently redirect to dashboard

### Polished in V1 RC

- Landing, README, dashboard, Nolt copy aligned to V1 RC / Phase 3.6
- Inventory History → Transactions labeling; stock link targets corrected
- Alerts page badge uses **Alerts**
- Dead unused inventory panels removed
- Stock filter table includes Lot column (parity with home preview)
- Planned feature CTA no longer points at a misleading “Sign-in (planned)”

---

## Technical debt list

1. Extract shared `ActionResult` / `fail()` / page chrome helpers
2. Shared form controls + `role="alert"` feedback
3. Codegen Supabase types instead of hand edits
4. Module registry (`MODULE_STATUS`) unused until Phase 5
5. Deprecated adjustment wrappers still exported from inventory module
6. Naming: `procurement` module vs `/purchasing` routes; `reorder` vs Restock UI
7. Alert sync duplicates SQL rules that also exist in TS calc helpers — keep documented in sync
8. Membership/role administration UI missing (RLS ready)
9. Historical `PHASE*_INSPECTION.md` files read as current without archive banners
10. `supabase/seed/README.md` still says Phase 0

---

## Documentation gaps (addressed / remaining)

| Doc | V1 RC action |
| --- | --- |
| README | Updated to V1 RC |
| PRODUCT_CONTEXT | Already current; release note added |
| ROADMAP | V1 RC + 1.1 recommendations section |
| ARCHITECTURE | Header → V1 RC / 3.6 |
| SECURITY_MODEL | Permission matrix through alerts; status V1 RC |
| INVENTORY_LEDGER | Header → 3.6 |
| DATA_DICTIONARY | Already 3.6 |
| TENANCY_MODEL | Clarified status vs product phase |
| PHASE*_INSPECTION | Left as historical; noted in this review |

---

## Naming inconsistencies

| Concept | Variants | Recommendation |
| --- | --- | --- |
| Buying domain | `procurement` module, Purchasing nav, `/purchasing` | Keep; document |
| Restock | `reorder` module, Restock UI, `inventory.reorder.*` | Keep; document |
| Transactions | History button vs Transactions title | Fixed label in V1 RC |
| Alerts filter `all` | Means “active” not all statuses | Documented in UI as “Open + acknowledged” |

---

## Recommended improvements (no new capabilities)

1. Merge Phase 3.5 → 3.6 → V1 RC to `main` in order
2. Smoke-test first customer org with restricted location user
3. Add `loading.tsx` for heavy inventory/purchasing routes
4. Wire membership admin UI with audit (small Phase 1 leftover)
5. Schedule alert sync job only when tenant volume demands it

---

## Deferred enhancements (not in V1)

- Email / SMS / push alert delivery
- Scheduled jobs / cron
- FEFO automation
- Serial numbers
- Demand forecasting / Nolt execution
- Stripe / PandaDoc
- Module activation framework
- Cycle-count scheduling beyond optional `due_date`
- Mobile barcode scanning
- Vendor portals / OCR invoices

---

## Recommended Version 1.1 roadmap

Prioritized for post-V1. Do **not** implement in this RC.

| Priority | Theme | Why |
| --- | --- | --- |
| P0 | Membership & role admin UI + audit | Completes access control operability |
| P0 | Alert notification delivery (email first) | Makes alerts actionable outside the app |
| P1 | Stripe billing | Monetization for customer deployment |
| P1 | Nolt Intelligence (read-only recommendations) | Differentiator; must not auto-mutate stock |
| P1 | FEFO picking guidance | Builds on lots/expiration already shipped |
| P2 | Demand forecasting | Depends on history volume + Nolt |
| P2 | Serial numbers | Regulated industries; schema design heavy |
| P2 | Mobile barcode scanning | Warehouse UX; needs API stability |
| P3 | PandaDoc | Document workflows after billing/contracts |
| P3 | Vendor portals | External identity + scoped PO visibility |
| P3 | OCR invoice processing | Integrations + AP boundary |

Suggested sequencing: **access admin → email alerts → Stripe → Nolt read-only → FEFO → serials/mobile**.

---

## Verification (V1 RC)

Commands expected green after this pass:

```bash
npm run db:reset && npm run db:bootstrap
npm run verify
npm run test:rls
npm run test:e2e
```

---

## Release recommendation

**Ship as Version 1.0 Release Candidate** for a pilot customer after:

1. Merging stacked PRs (3.5, 3.6, V1 RC)
2. Running full local verify + RLS + e2e
3. Manual walkthrough: sign-in → stock move → count → PO receive → lot/recall → restock draft PO → alerts sync

Do not expand scope into billing, Nolt execution, or delivery channels before that pilot feedback.