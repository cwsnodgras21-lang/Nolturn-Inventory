# Data dictionary

**Last reviewed:** 2026-08-02  
**Status:** Phase 2.4 schema applied

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
| items | Catalog masters; no quantity |
| item_variants | Optional variants |
| item_unit_conversions | Direct-to-base conversions |
| item_identifiers | Org-unique normalized identifiers |
| storage_areas | Nested areas within a location |
| storage_bins | Optional bins within an area |
| inventory_transaction_counters | Per-org transaction number sequence |
| inventory_transactions | Draft/completed/cancelled headers |
| inventory_transaction_lines | Entered quantities and destinations |
| inventory_ledger_entries | Immutable signed quantity effects |
| inventory_balances | Rebuildable on-hand projection |

## Permission keys

See `src/lib/permissions/catalog.ts`.

## RPCs

| Function | Purpose |
| --- | --- |
| `complete_inventory_transaction(uuid)` | Atomically post draft → ledger + balances |
| `rebuild_inventory_balances(uuid)` | Recompute balances from ledger for an org |

## Planned (not created)

Receipt/consumption/transfer/reversal types, lots, expiration, counts, procurement, modules, billing, Nolt execution tables.
