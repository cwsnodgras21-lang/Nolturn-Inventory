# Phase 2.2 inspection

**Date:** 2026-08-02

## 1. Phase 2.1 matches documentation

Yes. Units, categories, `catalog.read`/`catalog.manage`, RLS, audit, admin UI, bootstrap, and conversion contract in CATALOG_MODEL.md are present. No quantities or items yet.

## 2. Helpers to reuse

| Helper | Reuse |
| --- | --- |
| `requirePermission("catalog.*")` | All item commands |
| `private.user_has_permission` | RLS on new tables |
| `writeAuditEvent` | Item/variant/identifier/conversion mutations |
| `set_updated_at` | New tables |
| Catalog module pattern | Extend `src/modules/catalog/` |
| Units/categories queries | Item forms (pickers) |

## 3. Conflicts / decisions

| Topic | Decision |
| --- | --- |
| Conversion contract from 2.1 | Implement table now; enforce `to_unit_id = item.base_unit_id` |
| Base unit change | Allowed in 2.2 with caution; document future lock once ledger exists |
| Permissions | Reuse catalog.read/manage — no new inventory keys |
| Quantity | Not stored on items |
| Fake default variants | Not created |
| ADR | No superseding ADR required |

## 4. Migration sequence

1. `phase2_2_items` — items + same-org FK triggers
2. `phase2_2_variants_conversions_identifiers` — related tables + integrity
3. `phase2_2_items_rls` — RLS policies

## 5. Expected file changes

- New migrations
- `src/modules/catalog/*` (types, schemas, queries, commands, item UI)
- Audit action keys
- Nav + routes under `/administration/catalog/items`
- Bootstrap sample items
- Types, tests, docs

## 6. Assumptions

1. SKU unique per org, case-insensitive (nullable SKU on variants; required on items).
2. Category optional (`null` allowed) but when set must be same org.
3. Default entry unit must be base unit or have a conversion to base (validated on write when conversion exists; at minimum same-org unit — require conversion if different from base).
4. Identifier types: barcode, upc, ean, manufacturer_code, internal_code.
5. Normalized identifier = `lower(trim(value_display))` (spaces collapsed).
6. Soft status for items/variants; conversions and identifiers may be deleted by manage users (configuration). No hard deletes for items/variants through tenant workflows.

## Completion notes

Phase 2.2 delivered migrations, domain layer, admin UI, bootstrap samples, RLS/integrity tests, and documentation updates. Storage and inventory quantities remain out of scope.
