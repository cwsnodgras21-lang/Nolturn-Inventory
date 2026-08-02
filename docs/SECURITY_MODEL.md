# Security model

**Last reviewed:** 2026-08-02  
**Status:** Phase 2.5 enforced

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
| Inventory | `inventory.read` / `inventory.adjust` / `inventory.receive` / `inventory.consume` / `inventory.transfer` + location access on source/destination sides |

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

Completion RPC `complete_inventory_transaction` is security definer and re-checks type-specific permission + source/destination location access inside the database transaction. Draft line insert RLS allows any movement permission; unauthorized locations are blocked at app command and completion time (not on line insert).

## Service-role usage

| Use | Why |
| --- | --- |
| `scripts/bootstrap-local.ts` | Create Auth users + seed demo data locally |
| Future webhooks / support grants | Trusted server jobs only |

Never imported by Client Components (`import "server-only"`).

## Audit

Append-only `audit_events`. Inventory events include `inventory.transaction.*`, line add/remove, and type-specific completion keys (`inventory.receipt.completed`, `inventory.consumption.completed`, `inventory.transfer.completed`, `inventory.negative_adjustment.completed`).

## Threat mitigations

| Threat | Mitigation |
| --- | --- |
| Cross-tenant access | RLS + membership checks |
| Client-supplied org/location IDs | Revalidated every request + location helper |
| Duplicate stock posts | Header row lock + completed-status guard |
| Concurrent overspend | Balance row `FOR UPDATE` before debit |
| Tampered base quantities | Server recalculation on complete |
| Direct balance edits | No tenant write policies; ledger immutable |
| Restricted location escape | Completion + app command location checks; ledger/balance location-scoped RLS |
| Negative stock bypass | Exact-dimension stock assert unless `allow_negative_stock` |
| Service-role leakage | `server-only` + env discipline + tests |
