# Phase 2.1 inspection

**Date:** 2026-08-02

## 1. Phase 1 matches documentation

Yes. Implemented: Auth SSR, organizations, memberships, active-org cookie + revalidation, locations with `all|restricted`, roles/permissions, RLS helpers, audit foundation, bootstrap, RLS tests. Docs in PRODUCT_CONTEXT / SECURITY_MODEL / TENANCY_MODEL match.

## 2. Helpers to reuse

| Helper | Reuse |
| --- | --- |
| `requirePermission` / `requireTenantContext` | Catalog commands |
| `private.user_has_permission` | RLS policies |
| `writeAuditEvent` / `AUDIT_ACTIONS` | Catalog mutations |
| `private.seed_system_roles` | Extend with catalog keys + backfill |
| `set_updated_at` trigger | Units + categories |
| Domain module pattern (`organizations`, `locations`) | `src/modules/catalog` |

## 3. Architectural conflicts

| Issue | Resolution |
| --- | --- |
| Owner/Admin seed uses `select all from permissions` | New keys auto-apply for **new** orgs; migration must **backfill** existing orgs |
| Inventory Manager currently lacks catalog manage | Update seed + backfill per Phase 2.1 mapping |
| No ADR conflict for tenant-owned units/categories | Aligns with ADR-0002 shared schema + ADR-0003 RLS |
| Conversion table without items | Document contract only; no speculative FK table |

No ADR superseded.

## 4. Migration sequence

1. `phase2_1_catalog_permissions` — insert keys, update `seed_system_roles`, backfill role_permissions
2. `phase2_1_units_of_measure` — table, constraints, indexes, immutability trigger
3. `phase2_1_item_categories` — table, hierarchy, cycle prevention
4. `phase2_1_catalog_rls` — grants + RLS policies

## 5. Files / modules expected to change

- `supabase/migrations/*`
- `src/lib/permissions/catalog.ts`
- `src/modules/catalog/*` (new)
- `src/modules/audit/actions.ts`
- `src/config/app.ts` + admin nav
- `scripts/bootstrap-local.ts`
- `src/lib/supabase/types.ts`
- Docs + tests (`supabase/tests`, e2e)

## 6. Assumptions (units & categories)

1. Units and categories are **tenant-owned** (copied demo defaults, not global mutable catalog).
2. Dimensions: `count | volume | mass | length` only.
3. Unit kinds: `measurement | packaging`; packaging has no universal conversion.
4. Precision: `0..6` inclusive.
5. Soft status only (`active` / `inactive`); no normal hard delete.
6. Category uniqueness: case-insensitive among siblings (roots as siblings with `parent_id is null`).
7. Cycle prevention via trigger calling a recursive check with fixed `search_path`.
8. `item_unit_conversions` deferred to Phase 2.2 when `items` exist.
