# Catalog model

**Last reviewed:** 2026-08-02  
**Phase:** 2.2 — Items, variants, and identifiers

## Ownership

Units, categories, items, variants, conversions, and identifiers are **tenant-owned** (`organization_id`). Demo defaults are copied per organization during bootstrap — not a shared mutable global catalog.

## Units of measure

### Fields

`name`, `symbol`, `dimension`, `precision` (0–6), `unit_kind`, `status`, `is_system`

### Dimensions

`count` | `volume` | `mass` | `length`

### Unit kinds

| Kind | Meaning |
| --- | --- |
| `measurement` | Generally understood measurement (mL, g, …) |
| `packaging` | Commercial/operational unit (box, vial, …) with **no** universal conversion |

### Uniqueness

Case-insensitive unique `name` and `symbol` within an organization (`name_normalized` / `symbol_normalized` generated columns).

### Status

`active` | `inactive`. Soft status only; inactive units remain readable for history.

### Immutability

`organization_id` cannot change after create.

## Item categories

Hierarchical, tenant-owned.

### Rules

- Parent must be same organization
- Cannot parent self
- Cycles forbidden (DB trigger, `private.enforce_category_no_cycle`)
- Case-insensitive unique name among siblings (roots share null parent)
- Soft status; org id immutable

## Items

Catalog masters only — **no quantity columns**.

### Fields

`organization_id`, `name`, `description`, `category_id` (optional), `base_unit_id`, `default_entry_unit_id`, `sku`, `status`, `requires_variant`, `allow_negative_stock`

### Rules

- Category (when set) and both units must belong to the same organization
- SKU unique per organization (case-insensitive via `sku_normalized`)
- Soft status (`active` | `inactive`); no hard delete via tenant workflows
- `organization_id` immutable
- `allow_negative_stock` is reserved for future inventory policy
- If `requires_variant` is true, future inventory transactions must require a variant

### Base unit future lock

Once inventory transactions exist, `base_unit_id` must not be casually changeable. Phase 2.2 allows edits with UI warning; a later phase will enforce locking after the first ledger movement.

### Default entry unit

May equal the base unit. If different, a direct conversion from the entry unit to the base unit should exist before inventory entry uses it (enforced on item update in the app layer).

## Variants

Optional sizes/styles such as Glove / Small.

### Rules

- Belongs to one item; same organization as the item
- Optional SKU unique per organization when set
- Unique name per item (case-insensitive)
- Soft status; no fake default variants created
- No hard delete via tenant workflows

## Item unit conversions

```text
item_unit_conversions
- id uuid primary key
- organization_id uuid not null
- item_id uuid not null
- from_unit_id uuid not null
- to_unit_id uuid not null
- multiplier numeric not null  -- > 0
- created_at / updated_at
```

### Phase 2.2 invariants

- Item and units belong to the same organization
- `to_unit_id` must equal `items.base_unit_id` (direct to base only)
- Multiplier > 0
- No self-conversions
- No duplicate `(item_id, from_unit_id, to_unit_id)` pairs
- No chained conversion traversal
- Manage users may delete conversions (configuration, not ledger history)
- Future ledger rows should store the multiplier used at transaction time

## Identifiers

Types: `barcode` | `upc` | `ean` | `manufacturer_code` | `internal_code`

### Rules

- Belongs to an item; optional `variant_id` that must belong to that item
- Same organization as the item
- `value_display` preserved; `value_normalized` = lower + whitespace stripped
- Normalized value unique within the organization
- At most one primary identifier per item (no variant) and per item+variant
- Manage users may delete identifiers
- No scanner SDK; keyboard-wedge scanners use normal text inputs

## Permissions

| Key | Purpose |
| --- | --- |
| `catalog.read` | Read units, categories, items, variants, conversions, identifiers |
| `catalog.manage` | Create/update/status and conversion/identifier deletes |

Role mappings unchanged from 2.1: Owner/Admin/Inventory Manager get manage; Purchasing/Location/Staff/Read Only get read.

## RLS

Uses `private.user_has_permission(organization_id, 'catalog.read'|'catalog.manage')`. No anonymous access. Items/variants have no delete policies for tenants. Conversions/identifiers allow delete for manage.

## Audit actions

- `catalog.unit.created` / `updated` / `status_changed`
- `catalog.category.created` / `updated` / `reparented` / `status_changed`
- `catalog.item.created` / `updated` / `status_changed`
- `catalog.variant.created` / `updated`
- `catalog.conversion.created` / `deleted`
- `catalog.identifier.created` / `updated` / `deleted`

## Admin UI

- `/administration/catalog/units`
- `/administration/catalog/categories`
- `/administration/catalog/items` (list, create, edit, detail with variants/conversions/identifiers)

## Out of scope (2.2)

Storage areas, inventory quantities/transactions/balances, receiving, consumption, transfers, adjustments, lots, expiration, procurement, Stripe, PandaDoc, Nolt, industry modules.
