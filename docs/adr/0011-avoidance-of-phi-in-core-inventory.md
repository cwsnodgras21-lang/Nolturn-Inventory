# ADR-0011: Avoidance of PHI in core inventory

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

Healthcare customers may handle protected health information, but core inventory operations do not require patient data.

## Decision

Keep patient information out of the core inventory platform. Do not claim HIPAA compliance from auth/RLS alone. Any future patient-linked workflow requires separate legal, security, retention, and compliance review and data classification.

## Consequences

Positive: lower compliance surface for MVP.  
Negative: clinic dispensing workflows that need patient linkage are deferred and must be designed deliberately.
