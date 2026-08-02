# ADR-0012: Support-access controls

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

NolTurn Support occasionally needs tenant access, but silent super-admin backdoors are unacceptable.

## Decision

Support access requires tenant authorization or documented policy, a time-limited grant, a stated reason, full audit logging, and revocation. NolTurn Support roles do not silently bypass tenant controls.

## Consequences

Positive: accountable support operations.  
Negative: support tooling must be built before production customer success workflows rely on it.
