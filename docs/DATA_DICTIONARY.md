# Data dictionary

**Last reviewed:** 2026-08-02  
**Status:** Phase 2.6 schema applied

## Implemented tables

| Table | Notes |
| --- | --- |
| profiles | 1:1 with `auth.users`; not the tenant boundary |
| organizations | Tenant root; unique kebab slug |
| organization_memberships | Unique (org, user); location_access_mode |
| locations | Org-scoped; `organization_id` immutable |
| permissions | Global catalog |
| roles | Org-scoped system roles |
| role_permissions | Role ↔ permission |
| membership_roles | Membership ↔ role |
| membership_location_scopes | Restricted location grants |
| audit_events | Append-only application audit |
| units_of_measure | Tenant units |
| item_categories | Hierarchical categories |
| items | Catalog masters; no quantity; `allow_negative_stock` enforced on debit |
| item_variants | Optional variants |
| item_unit_conversions | Direct-to-base conversions |
| item_identifiers | Org-unique normalized identifiers |
| storage_areas | Nested areas within a location |
| storage_bins | Optional bins within an area |
| inventory_transaction_counters | Per-org transaction number sequence |
| inventory_transactions | Draft/completed/cancelled/reversed headers; movement types + `reversal`; optional `reference_text`; `reverses_transaction_id` / `reversed_by_transaction_id` |
| inventory_transaction_lines | Entered quantities with nullable source and/or destination storage |
| inventory_ledger_entries | Immutable signed quantity effects; `effect_role` (`primary` \| `source` \| `destination`) |
| inventory_balances | Rebuildable on-hand projection |

## Permission keys

See `src/lib/permissions/catalog.ts`. Movement keys: `inventory.read`, `inventory.adjust`, `inventory.receive`, `inventory.consume`, `inventory.transfer`, `inventory.reverse`.

## RPCs

| Function | Purpose |
| --- | --- |
| `complete_inventory_transaction(uuid)` | Atomically post draft → ledger + balances (type-aware) |
| `reverse_inventory_transaction(uuid, text)` | Atomically reverse a completed transaction with exact inverse ledger posts |
| `reconcile_inventory_balances(uuid)` | Return projection vs ledger mismatches (`inventory.adjust`) |
| `rebuild_inventory_balances(uuid)` | Recompute balances from ledger for an org (`inventory.adjust`) |

## Planned (not created)

Lots, expiration, counts, procurement, modules, billing, Nolt execution tables.
