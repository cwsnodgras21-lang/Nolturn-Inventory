# Phase 2.3 inspection

**Date:** 2026-08-02

## 1. Phase 2.2 matches documentation

Yes. Items, variants, conversions, identifiers, catalog permissions, RLS, audit, admin UI, and bootstrap samples are present. No storage hierarchy or quantities yet.

## 2. Helpers to reuse

| Helper | Reuse |
| --- | --- |
| `requirePermission` | Storage permission gates |
| `requireLocationAccess` | Validate location before read/mutate (first product consumer) |
| `private.user_has_permission` | RLS permission checks |
| `private.user_can_access_location` | RLS location scoping (same pattern as `locations`) |
| `writeAuditEvent` | Storage area/bin mutations |
| Category cycle triggers | Model for storage hierarchy integrity |
| Catalog module layout | Mirror as `src/modules/storage/` |

## 3. Conflicts / decisions

| Topic | Decision |
| --- | --- |
| Permission keys | New `inventory.storage.read` / `inventory.storage.manage` — not folded into `locations.*` or `catalog.*` |
| RLS | Permission **and** `user_can_access_location(location_id)` — catalog RLS is wrong template |
| Module placement | New `src/modules/storage/` (not under catalog) |
| UI placement | `/administration/storage` with location selector |
| Drag-and-drop | Skip; parent selector only |
| Bins | Optional; no denormalized quantity; inventory may later attach at area without bin |
| Org/location immutability | Triggers on storage areas; org + storage_area immutable on bins |
| ADR | No superseding ADR required |

## 4. Migration sequence

1. `phase2_3_storage_permissions` — keys, `seed_system_roles`, backfill
2. `phase2_3_storage_areas` — table + same-org/location + cycle prevention
3. `phase2_3_storage_bins` — optional bins + integrity
4. `phase2_3_storage_rls` — RLS with location access

## 5. Expected file changes

- New migrations
- `src/lib/permissions/catalog.ts` + `seed_system_roles`
- `src/modules/storage/*`
- Audit action keys
- Nav + `/administration/storage`
- Bootstrap sample tree under Primary (and optionally Storage site)
- Types, RLS tests, docs

## 6. Assumptions

1. Area types: room, cabinet, shelf, refrigerator, freezer, closet, warehouse, other.
2. Code uniqueness: areas unique within location when provided; bins unique within area when provided (case-insensitive via normalized generated columns).
3. Soft status only (`active`/`inactive`); no hard-delete policies for tenants.
4. Restricted users see/manage storage only for allowed locations (RLS + server helpers).
5. Purchasing Manager gets storage read only; Location Manager / Staff / Read Only get read (Location Manager also manage), all still location-scoped by RLS.
6. Bootstrap seeds a realistic tree under org A Primary location; a smaller tree may also exist under Storage location for restricted-user isolation tests.
7. Permission key format expanded to multi-segment (`inventory.storage.read`) while remaining lowercase dotted identifiers.

## Completion notes

Phase 2.3 delivers storage areas, optional bins, location-scoped permissions/RLS, admin UI, bootstrap, and tests. Inventory ledger and quantities remain out of scope.
