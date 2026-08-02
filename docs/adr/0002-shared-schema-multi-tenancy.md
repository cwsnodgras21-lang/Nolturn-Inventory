# ADR-0002: Shared-schema multi-tenancy

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

The product is multi-tenant SaaS. Options include database-per-tenant, schema-per-tenant, or shared schema with tenant keys.

## Decision

Use a shared database and shared schema with explicit `organization_id` ownership and membership-based access. Primary tenant entity is `organizations`.

## Consequences

Positive: operational simplicity, easier cross-tenant product evolution.  
Negative: RLS and application authorization must be rigorous; noisy-neighbor monitoring needed later.
