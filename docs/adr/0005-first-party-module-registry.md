# ADR-0005: First-party module registry

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

Industry capabilities must extend the core without forking or allowing customers to upload executable code.

## Decision

Register modules as first-party application code. Activate per organization via configuration and entitlements. Enforce enablement on the server for actions and APIs, not only in navigation.

## Consequences

Positive: safe extensibility and shared core.  
Negative: module contracts and dependency graphs must be maintained deliberately.
