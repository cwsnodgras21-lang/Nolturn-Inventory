# Data dictionary

**Last reviewed:** 2026-08-02  
**Status:** Phase 3.4 schema applied

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
| items | Catalog masters; no quantity; `allow_negative_stock`; `tracking_mode` (`quantity`/`lot`) |
| item_variants | Optional variants |
| item_unit_conversions | Direct-to-base conversions |
| item_identifiers | Org-unique normalized identifiers |
| storage_areas | Nested areas within a location |
| storage_bins | Optional bins within an area |
| inventory_transaction_counters | Per-org transaction number sequence |
| inventory_transactions | Draft/completed/cancelled/reversed headers; optional `purchase_order_id` |
| inventory_transaction_lines | Entered quantities; optional `purchase_order_line_id`; optional `lot_id` |
| inventory_ledger_entries | Immutable signed quantity effects; `effect_role`; optional `lot_id` |
| inventory_balances | Rebuildable on-hand projection; optional `lot_id` in unique dims |
| inventory_lots | Lot masters: number, optional expiration, status, notes |
| inventory_recalls | Recall headers: number, source, severity, status, announced date, notes, closed_at |
| inventory_recall_lots | Recall ↔ lot attachments; unique `(recall_id, lot_id)` |
| count_sessions | Count headers; statuses draft/in_progress/ready_for_review/completed/cancelled; blind flag |
| count_session_locations | Assigned locations for a session |
| count_lines | Frozen expected qty, counted qty, variance, review status, optional reconciliation txn link, optional `lot_id` |
| suppliers | Tenant suppliers; soft `active`/`inactive` |
| supplier_contacts | Contacts for a supplier |
| purchase_order_counters | Per-org PO number sequence |
| purchase_orders | PO headers; ship-to location; draft/submitted/partially_received/received/cancelled |
| purchase_order_lines | Ordered/received/remaining in purchase unit; frozen conversion multiplier |

## Permission keys

See `src/lib/permissions/catalog.ts`. Includes inventory/count/purchasing/lots keys plus `inventory.recalls.read` and `inventory.recalls.manage`.

## RPCs

| Function | Purpose |
| --- | --- |
| `complete_inventory_transaction(uuid)` | Atomically post draft → ledger + balances |
| `reverse_inventory_transaction(uuid, text)` | Exact inverse ledger reversal |
| `reconcile_inventory_balances(uuid)` | Projection vs ledger mismatches |
| `rebuild_inventory_balances(uuid)` | Recompute balances from ledger (includes lot dims) |
| `quarantine_recall_lots(uuid)` | Set all lots on a recall to `quarantined` |
| `start_count_session(uuid)` | Freeze expected quantities from balances |
| `submit_count_session_for_review(uuid)` | Move in-progress count to review |
| `return_count_session_for_correction(uuid)` | Return review to in-progress |
| `review_count_line(uuid, text)` | Accept or reject a counted line |
| `approve_count_session_reconciliation(uuid)` | Post ± adjustments via completion pipeline |
| `submit_purchase_order(uuid)` | Draft → submitted |
| `cancel_purchase_order(uuid)` | Cancel draft/submitted with zero receipts |
| `receive_purchase_order(uuid, jsonb, text, text)` | Partial/full receive via inventory receipt completion (lot-aware) |

## Planned (not created)

Serials, patient tracing, external recall feeds, purchase requests/approvals, AP, modules, billing, Nolt execution tables.
