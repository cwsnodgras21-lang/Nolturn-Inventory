# Tenancy model

**Last reviewed:** 2026-08-02  
**Status:** Phase 2.3 (location-scoped storage)

## Model

Shared database, shared schema, explicit tenant ownership via `organizations`.

## Memberships

Access is through `organization_memberships` (not a single mutable org id on the profile).

Statuses: `pending` | `active` | `suspended` | `revoked`  
Only `active` grants access.

Roles are attached via `membership_roles` (not a single `role_id` column). Same-organization invariant enforced by trigger.

## Location access

Explicit mode on membership:

- `all` — organization-wide location access
- `restricted` — only rows in `membership_location_scopes`

Location-scoped product data (storage areas/bins today; inventory later) must honor this mode in both server helpers and RLS.

## Active organization

Stored in httpOnly cookie `nolt_active_organization_id`.  
Cookie is never treated as proof of authorization.

## Soft delete

Organizations, locations, storage areas, and bins use status transitions (`archived` / `inactive`). Casual hard deletes are not part of the product workflow.
