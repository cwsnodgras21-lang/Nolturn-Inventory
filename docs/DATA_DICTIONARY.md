# Data dictionary

**Last reviewed:** 2026-08-02  
**Status:** Phase 3.1 schema applied

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
| inventory_transactions | Draft/completed/cancelled/reversed headers; movement types + `reversal`; link columns |
| inventory_transaction_lines | Entered quantities with nullable source and/or destination storage |
| inventory_ledger_entries | Immutable signed quantity effects; `effect_role` |
| inventory_balances | Rebuildable on-hand projection |
| count_sessions | Count headers; statuses draft/in_progress/ready_for_review/completed/cancelled; blind flag |
| count_session_locations | Assigned locations for a session |
| count_lines | Frozen expected qty, counted qty, variance, review status, optional reconciliation txn link |

## Permission keys

See `src/lib/permissions/catalog.ts`. Includes movement keys plus `inventory.count.read`, `inventory.count.perform`, `inventory.count.review`.

## RPCs

| Function | Purpose |
| --- | --- |
| `complete_inventory_transaction(uuid)` | Atomically post draft → ledger + balances |
| `reverse_inventory_transaction(uuid, text)` | Exact inverse ledger reversal |
| `reconcile_inventory_balances(uuid)` | Projection vs ledger mismatches |
| `rebuild_inventory_balances(uuid)` | Recompute balances from ledger |
| `start_count_session(uuid)` | Freeze expected quantities from balances |
| `submit_count_session_for_review(uuid)` | Move in-progress count to review |
| `return_count_session_for_correction(uuid)` | Return review to in-progress |
| `review_count_line(uuid, text)` | Accept or reject a counted line |
| `approve_count_session_reconciliation(uuid)` | Post ± adjustments via completion pipeline |

## Planned (not created)

Lots, expiration, serials, procurement, modules, billing, Nolt execution tables.
