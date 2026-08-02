# Nolt architecture

**Last reviewed:** 2026-08-02  
**Status:** Design documented. Capability layer begins Phase 7.

## Naming

**Nolt** is the platform intelligence layer. Do not label it generically as “AI Assistant” in architecture or product code when referring to this system.

Code lives under:

```text
src/modules/nolt/
  capabilities/
  providers/
  prompts/
  tools/
  policies/
  schemas/
  services/
  evaluations/
  audit/
```

## Capability contract

```ts
interface NoltCapability<TInput, TOutput> {
  id: string;
  version: string;
  inputSchema: unknown;
  outputSchema: unknown;
  requiredPermissions: string[];
  requiredModules: string[];
  execute(context: NoltExecutionContext, input: TInput): Promise<TOutput>;
}
```

## Execution record

Every execution should capture organization, user, permissions, enabled modules, capability, input, provider/model, prompt version, output, confidence where applicable, timestamp, cost/token metadata, and audit identifier.

## Safety rules

1. Nolt never bypasses tenant access rules.
2. Tools call the same authorized domain services as the application.
3. Models must not query unrestricted database tables directly.
4. Outputs distinguish confirmed facts, calculated values, model interpretation, and recommended actions.
5. Initial posture is **read-only / recommendation-focused**.
6. No autonomous inventory changes, PO submission, or supplier communication without explicit approval workflows.

## Initial capabilities (Phase 7)

- Reorder suggestion
- Stockout risk
- Expiration risk
- Inventory summary
- Data quality review

## Phase 0 reality

Only the module folder and documentation exist. No providers, prompts, or UI capabilities are implemented.
