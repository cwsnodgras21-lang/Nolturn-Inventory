# ADR-0009: Supabase Auth

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

The platform needs authentication integrated with Postgres RLS and Vercel hosting.

## Decision

Use Supabase Auth for identity. Prefer server-side session validation. Do not authorize from editable user metadata. Pair Auth with membership tables for multi-org access.

## Consequences

Positive: aligned with Supabase Postgres/RLS.  
Negative: support multi-org switching and JWT freshness carefully; avoid treating JWT claims as always current for fine-grained auth data.
