# ADR-0004: Inventory transaction ledger

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

Inventory quantities must be trustworthy for operations, audits, and reconciliation.

## Decision

Model stock movements as an immutable `inventory_transactions` / `inventory_transaction_lines` ledger. Quantities derive from durable transactions or controlled balance mutations. Corrections use reversals or compensating transactions — never silent edits to completed transactions.

## Consequences

Positive: auditability and correct reversals.  
Negative: more write complexity; reporting must understand transaction types.
