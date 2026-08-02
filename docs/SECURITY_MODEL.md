# Security model

**Last reviewed:** 2026-08-02  
**Status:** Phase 2.6 enforced

## Authentication

- Supabase Auth email/password
- Server derives user via `supabase.auth.getUser()`
- `src/proxy.ts` refreshes session cookies
- Do not authorize from editable `user_metadata`

## Authorization layers

1. Supabase authentication
2. PostgreSQL RLS on every application table
3. Server helpers: `requireUser`, `requireTenantContext`, `requirePermission`, `requireLocationAccess`
4. UI affordances (not a security boundary)

| Domain | Permissions |
| --- | --- |
| Catalog | `catalog.read` / `catalog.manage` |
| Storage | `inventory.storage.read` / `inventory.storage.manage` + location access |
| Inventory | `inventory.read` / `inventory.adjust` / `inventory.receive` / `inventory.consume` / `inventory.transfer` / `inventory.reverse` + location access on affected sides |

## Tenant resolution

1. Read candidate org id from cookie or explicit argument
2. Verify active membership for `auth.uid()`
3. Resolve roles → permissions
4. Resolve location access mode + allowed locations
5. Reject pending/suspended/revoked memberships

## RLS helpers (`private` schema)

- `user_has_active_membership(organization_id)`
- `user_has_permission(organization_id, permission_key)`
- `user_can_access_location(location_id)`

`complete_inventory_transaction` and `reverse_inventory_transaction` are security definer and re-check permissions + location access inside the database transaction.

Draft line insert/update RLS requires accessible source/destination locations (unauthorized IDs are not persisted; same generic failure as inaccessible). Completion and reverse remain defense in depth.

Tenants cannot insert `transaction_type = reversal` or set `reverses_transaction_id` / `reversed_by_transaction_id` via RLS; only the reverse RPC may create those links.

`rebuild_inventory_balances` and `reconcile_inventory_balances` require `inventory.adjust` for authenticated callers.

## Service-role usage

| Use | Why |
| --- | --- |
| `scripts/bootstrap-local.ts` | Create Auth users + seed demo data locally |
| Future webhooks / support grants | Trusted server jobs only |

Never imported by Client Components (`import "server-only"`).

## Audit

Append-only `audit_events`. Inventory events include `inventory.transaction.*` (including `inventory.transaction.reversed`), line add/remove, and type-specific completion keys (`inventory.receipt.completed`, `inventory.consumption.completed`, `inventory.transfer.completed`, `inventory.negative_adjustment.completed`).

## Threat mitigations

| Threat | Mitigation |
| --- | --- |
| Cross-tenant access | RLS + membership checks |
| Client-supplied org/location IDs | Revalidated every request + location helper |
| Duplicate stock posts | Header row lock + completed-status guard |
| Duplicate reversals | Header lock + unique reverse links + status `reversed` |
| Concurrent overspend | Balance row `FOR UPDATE` before debit |
| Tampered base quantities | Server recalculation on complete; reverse uses stored originals |
| Direct balance edits | No tenant write policies; ledger immutable |
| Restricted location escape | Draft RLS + completion/reverse + app command location checks |
| Negative stock bypass | Exact-dimension stock assert unless `allow_negative_stock` |
| Unauthorized reverse | `inventory.reverse` + all affected locations accessible |
| Service-role leakage | `server-only` + env discipline + tests |
