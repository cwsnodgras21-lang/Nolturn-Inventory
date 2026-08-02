# Customer onboarding

**Last reviewed:** 2026-08-02  
**Status:** Productization 1 implemented

## Purpose

Take a newly created organization from an empty tenant to a usable inventory workspace without developer intervention.

## Flow

1. Organization details (required) — display name, timezone, date format, currency, contact, optional logo
2. Primary location (required) — confirm/update PRIMARY site
3. Invite team (optional) — email + role + location access
4. Starter configuration (required) — blank / clinic / dental / med spa reference data
5. Import or create items (optional) — CSV dry-run + all-or-nothing commit, or manual create
6. Modules (required) — enable core inventory + optional modules (configuration only)
7. Review and finish (required)

Users may leave and resume via `/onboarding` or the dashboard setup card. Optional steps can be skipped.

## Starter packs

Application-defined packs seed **reference data only**:

- Units of measure
- Categories
- Suggested storage areas on the primary location
- Optional demo catalog items when explicitly enabled

They do **not** hard-code industry logic into core tables and do **not** create inventory balances.

## CSV import

- Template columns: `name,sku,base_unit,entry_unit,category,description`
- Validation preview with row errors, duplicate SKU detection, unit/category matching
- Commit mode: **all-or-nothing** (failed commits roll back items created in that batch)
- Quantities are not imported; use the existing opening-balance workflow

## Invitations

States: `pending`, `accepted`, `expired`, `revoked`.

- Create with `members.manage` (token stored as SHA-256 hash)
- Accept via `/invitations/accept?token=…` using `accept_organization_invitation`
- Email must match the signed-in user
- **Local/dev:** copyable accept link is returned to the inviter
- **Production email delivery:** not configured; integrate transactional email later without changing the domain model

## Modules

`module_definitions` + `organization_modules` provide entitlement groundwork. Billing enforcement is deferred. Core Inventory remains required.

## Branding & storage

Organization branding fields live on `organizations`. Logos use private bucket `org-logos` with tenant-scoped storage RLS and signed URLs.

## Security

- Normal onboarding actions use the authenticated Supabase client (no service role)
- RLS on onboarding, invitations, modules, import batches, and logo objects
- Audit events for details, location, invites, starter apply, modules, import, completion
