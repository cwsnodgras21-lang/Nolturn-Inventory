# ADR-0006: Centralized Nolt capability layer

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

Intelligence features must not scatter provider calls and prompts across pages.

## Decision

Centralize Nolt under `src/modules/nolt/` with capability contracts, providers, prompt versioning, authorized tools, and execution audit. Initial posture is read-only recommendations. Tools call the same authorized domain services as the UI.

## Consequences

Positive: consistent auth, audit, and evaluation.  
Negative: product teams must add capabilities through the registry rather than ad-hoc page calls.
