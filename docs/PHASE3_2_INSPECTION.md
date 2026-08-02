# Phase 3.2 inspection

**Date:** 2026-08-02

## 1. Phase 3.1 matches documentation

Yes. Counts sessions/lines, blind mode, frozen expected quantities, review, and ledger reconciliation via `complete_inventory_transaction` are in place. Procurement/suppliers modules remain stubs. Purchasing UI is still a Phase 4 placeholder. Standalone `receipt` movements exist with optional `reference_text` (not a PO link).

## 2. Helpers to reuse

| Helper | Reuse |
| --- | --- |
| `complete_inventory_transaction` | Post PO receipts — no second receiving engine |
| `private.resolve_item_conversion_multiplier` | Freeze conversion onto PO lines at create/edit (draft) |
| `private.next_inventory_transaction_number` pattern | PO numbering (`PO-######`) via org counter |
| `requirePermission` / `requireLocationAccess` | Supplier/PO commands + ship-to / receive destinations |
| `private.user_has_permission` / `user_can_access_location` | RLS + receive RPC |
| `writeAuditEvent` / `AUDIT_ACTIONS` | Supplier + PO lifecycle keys |
| Catalog soft status (`active`/`inactive`) | Suppliers |
| Permission seed/backfill pattern (Phase 3.1) | `purchasing.read` / `manage` / `receive` |

## 3. Architectural concerns

| Concern | Resolution |
| --- | --- |
| Must not invent a second receiving engine | Atomic `receive_purchase_order` creates a normal `receipt` draft, calls `complete_inventory_transaction`, then updates PO received qty / status |
| Complete recalculates conversion from live catalog | Receive posts inventory lines in **item base units** using qty × frozen PO-line multiplier so later catalog unit changes cannot alter posted stock |
| Over-receipt | Reject when receive qty > remaining (purchase units); controlled exception |
| Duplicate / concurrent receive | `FOR UPDATE` on PO header; remaining checks; completion path already prevents double-post of the same txn |
| Multi-line atomicity | Single RPC transaction — any failure rolls back receipt + PO updates |
| Location Manager scope | Ship-to / receive destinations require `user_can_access_location`; manage limited to Owner/Admin/Inventory/Purchasing managers |
| `purchasing.receive` vs `inventory.receive` | Receive RPC requires `purchasing.receive`; nested complete still requires `inventory.receive` (granted to the same roles that receive) |
| FORCE RLS on inventory tables | Receive RPC is `SECURITY DEFINER` (postgres) so it can insert/complete; app never bypasses helpers |
| SELECT policy recursion | Do not re-query `purchase_orders` from within its own SELECT policy helper (Phase 3.1 lesson) |
| Cancel after partial receive | Cancel only when `received_quantity` is zero on all lines (draft/submitted) |
| Lots / expiration / approvals | Out of scope |

## 4. Decisions

| Topic | Decision |
| --- | --- |
| Supplier status | Soft `active` / `inactive` (no hard delete) |
| Supplier contacts | Optional child rows; tenant-owned; cascade with supplier |
| PO statuses | `draft` → `submitted` → `partially_received` → `received`; `cancelled` from draft/submitted with zero receipts |
| PO numbering | Org counter → `PO-000001` |
| Line conversion | Stored on line at draft save; immutable after submit |
| Quantities | Ordered/received/remaining in purchase unit; remaining generated/stored as ordered − received |
| Receipt link | `inventory_transactions.purchase_order_id` + `inventory_transaction_lines.purchase_order_line_id` |
| History | Query completed receipts by `purchase_order_id` (no separate history table) |
| Permissions | `purchasing.read` / `manage` / `receive` with role map in brief |
| UI | `/purchasing`, `/purchasing/suppliers`, `/purchasing/orders` (+ new/[id]) |
| ADR | No supersede; receipts remain ledger receipts (ADR-0004 family) |

## 5. Migration sequence

1. `phase3_2_purchasing_permissions` — keys + role seed/backfill  
2. `phase3_2_purchasing` — suppliers/contacts, POs/lines, counters, txn link columns, RLS, submit/cancel/receive RPCs  

## 6. Expected file changes

- Migrations + `PERMISSION_KEYS` + `appConfig.phase = 3.2`
- `src/modules/suppliers/` + `src/modules/procurement/` (replace stubs)
- Audit keys for supplier/PO lifecycle
- Purchasing routes + nav status `available`
- `supabase/tests/rls.purchasing.test.ts` (+ e2e phase label)
- Docs: PRODUCT_CONTEXT, INVENTORY_LEDGER, DATA_DICTIONARY, ROADMAP, ARCHITECTURE

## 7. Assumptions

1. Unit cost on PO lines is optional informational (copied onto receipt lines when present).
2. Ship-to location is required on PO; receive may use that location with caller-chosen storage area/bin per line.
3. Submit requires ≥1 line and active supplier.
4. Partial receipt allowed on any submitted/partially_received PO.
5. Purchase requests, approvals, AP, payments, lots, serials, auto-reorder remain out of scope.

## Completion notes

Phase 3.2 delivers suppliers and purchase orders with ledger-backed receiving. Approvals, lots/expiration, automated reordering, Nolt, Stripe, and PandaDoc remain out of scope.

### Delivered checklist

- [x] Inspection recorded
- [x] Migrations: purchasing permissions, suppliers/POs, receive RPCs, RLS
- [x] Domain layer + audit events
- [x] Purchasing UI (suppliers / orders)
- [x] RLS tests + e2e smoke phase label
- [x] Docs updated to Phase 3.2
