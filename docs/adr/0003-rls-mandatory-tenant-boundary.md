# ADR-0003: RLS as mandatory tenant boundary

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

Application-layer checks alone are insufficient; bugs can leak data across tenants.

## Decision

Enable PostgreSQL Row Level Security on every tenant-owned table. Policies enforce organization membership (and location scope where required). Database rejects cross-tenant access even if app code is wrong.

## Consequences

Positive: defense in depth.  
Negative: every query path must be designed for RLS; service-role usage must be carefully constrained and audited.
