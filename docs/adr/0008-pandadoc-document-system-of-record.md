# ADR-0008: PandaDoc as document system of record

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

Agreements and e-sign workflows need design, sending, signature, and audit trail capabilities.

## Decision

Use PandaDoc as the document design, send, e-sign, and audit system. Nolt Inventory stores linkage metadata and status via an adapter; it does not build a competing editor.

## Consequences

Positive: faster delivery of document workflows.  
Negative: dependency on PandaDoc availability and webhook authenticity verification.
