# Module system

**Last reviewed:** 2026-08-02  
**Status:** Design documented. Registry implementation is Phase 5.

## Purpose

Provide a common inventory core while enabling industry-specific and integration capabilities per organization without forking the product.

## Module IDs (examples)

```text
core.inventory
core.procurement
industry.clinic
industry.dental
industry.medspa
integration.stripe
integration.pandadoc
```

## Definition contract

```ts
interface ProductModuleDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  dependencies: string[];
  permissions: string[];
  navigation: ModuleNavigationItem[];
  settingsSchema?: unknown;
  customFieldDefinitions?: unknown[];
  dashboardWidgets?: unknown[];
  reports?: unknown[];
  noltCapabilities?: string[];
}
```

## Persistence (planned)

```text
module_definitions
organization_modules
organization_module_settings
```

Organization module records track status, configuration, entitlement, version, and migration state.

## Enforcement rules

1. Modules are **first-party application code** registered in the repo.
2. Customers activate modules through configuration/entitlements — they do not upload executable code.
3. Hiding navigation is not sufficient; disabled modules must fail server actions and APIs.
4. Dependencies must be satisfied before enablement.
5. `industry.clinic` is the first industry module registered (Phase 5 contract; MVP features in Phase 6).

## Tenant configuration vs modules

Prefer configuration (custom fields, naming, categories, thresholds, saved views) over new modules when differences do not justify industry-specific domain logic.
