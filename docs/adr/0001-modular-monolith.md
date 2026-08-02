# ADR-0001: Modular monolith

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

Nolt Inventory needs clear domain boundaries and room to grow across industries, but the team is early and should avoid distributed-system complexity.

## Decision

Ship a modular monolith: one Next.js deployable with explicit `src/modules/*` domains, shared Postgres, and adapter boundaries for integrations.

## Consequences

Positive: simpler ops, shared transactions, faster iteration.  
Negative: discipline required to keep module boundaries clean; extract services later only with evidence.
