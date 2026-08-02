# Security model

**Last reviewed:** 2026-08-02  
**Status:** Phase 2.4 enforced

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
| Inventory | `inventory.read` / `inventory.adjust` + location access on destinations |

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

Completion RPC `complete_inventory_transaction` is security definer and re-checks permission + location access inside the database transaction.

## Service-role usage

| Use | Why |
| --- | --- |
| `scripts/bootstrap-local.ts` | Create Auth users + seed demo data locally |
| Future webhooks / support grants | Trusted server jobs only |

Never imported by Client Components (`import "server-only"`).

## Audit

Append-only `audit_events`. Inventory events include `inventory.transaction.*` and line add/remove.

## Threat mitigations

| Threat | Mitigation |
| --- | --- |
| Cross-tenant access | RLS + membership checks |
| Client-supplied org/location IDs | Revalidated every request + location helper |
| Duplicate stock posts | Header row lock + completed-status guard |
| Tampered base quantities | Server recalculation on complete |
| Direct balance edits | No tenant write policies; ledger immutable |
| Restricted location escape | Line/ledger/balance location-scoped RLS |
| Service-role leakage | `server-only` + env discipline + tests |
