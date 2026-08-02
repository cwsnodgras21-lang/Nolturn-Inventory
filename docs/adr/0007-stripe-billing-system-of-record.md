# ADR-0007: Stripe as billing system of record

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

SaaS billing requires subscriptions, entitlements, and reliable activation.

## Decision

Stripe is the payment system of record. The application maintains a synchronized entitlement projection for authorization. Activation relies on verified webhooks, not redirect success pages.

## Consequences

Positive: proven billing ops and clear boundary.  
Negative: webhook idempotency and entitlement sync must be correct before gating features.
