# ADR-0010: Immutable audit history

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

Security, operations, and compliance require reconstructable history of sensitive actions.

## Decision

Maintain an append-only audit system for authentication, membership, roles, modules, inventory, procurement, integrations, Nolt executions, support access, and exports. Do not store secrets in audit payloads.

## Consequences

Positive: forensics and accountability.  
Negative: retention and redaction policies must be defined before storing rich before/after payloads.
