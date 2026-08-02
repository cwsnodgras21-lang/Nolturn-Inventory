# Security model

**Last reviewed:** 2026-08-02  
**Status:** Productization 1 (onboarding + Phases 1–3.6)

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
| Organization | `organization.read` / `organization.manage` |
| Members / roles | `members.*` / `roles.*` |
| Locations | `locations.read` / `locations.manage` |
| Audit / settings | `audit.read` / `settings.*` |
| Catalog | `catalog.read` / `catalog.manage` |
| Storage | `inventory.storage.read` / `inventory.storage.manage` + location access |
| Inventory | `inventory.read` / `inventory.adjust` / `inventory.receive` / `inventory.consume` / `inventory.transfer` / `inventory.reverse` + location access |
| Counts | `inventory.count.read` / `perform` / `review` + location access |
| Purchasing | `purchasing.read` / `manage` / `receive` + ship-to location access |
| Lots | `inventory.lots.read` / `inventory.lots.manage` |
| Recalls | `inventory.recalls.read` / `inventory.recalls.manage` |
| Reorder | `inventory.reorder.read` / `inventory.reorder.manage` |
| Alerts | `alerts.read` / `alerts.manage` |

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

Mutating SECURITY DEFINER RPCs (complete/reverse inventory, count lifecycle, PO submit/cancel/receive, recall quarantine, alert sync) re-check permissions and, where applicable, location access inside the database transaction.

All public application tables enable RLS; Phase 3+ tables also FORCE RLS (V1 RC hardening).

## Onboarding & invitations

- Onboarding mutations require `organization.manage` / `locations.manage` / `catalog.manage` / `members.manage` as appropriate — no service role in the request path
- Invitation tokens are stored as SHA-256 hashes; raw tokens are shown once (local/dev copy link)
- `accept_organization_invitation` verifies pending status, expiry, and email match to `auth.users`
- Logo objects live in private `org-logos`; storage RLS scopes paths to `organization_id/…`
- Completing onboarding is gated in application code on required steps (details, location, starter, modules)

## Service role

- `createServiceRoleClient` is `server-only`
- Approved uses: local bootstrap script and RLS test harness
- Never import from Client Components or expose via `NEXT_PUBLIC_*`
- Normal onboarding actions must not use the service role

## Audit

Application mutations write `audit_events` via `writeAuditEvent`, including onboarding, invitation, logo, and catalog import actions. Role assignment UI beyond invitations remains limited; tables stay RLS-protected for manage permissions.
