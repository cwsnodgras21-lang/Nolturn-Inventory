export const PRODUCT_MODULES = [
  {
    id: "core.inventory",
    name: "Core Inventory",
    description: "Catalog, storage, ledger, movements, and counts",
    isCore: true,
  },
  {
    id: "core.purchasing",
    name: "Purchasing",
    description: "Suppliers, purchase orders, and receiving",
    isCore: false,
  },
  {
    id: "core.lots",
    name: "Lots and Expiration",
    description: "Lot tracking and expiration views",
    isCore: false,
  },
  {
    id: "core.recalls",
    name: "Recalls",
    description: "Recall records and quarantine workflows",
    isCore: false,
  },
  {
    id: "core.reorder",
    name: "Reorder Planning",
    description: "Reorder rules and restock planning",
    isCore: false,
  },
  {
    id: "core.alerts",
    name: "Alerts",
    description: "Operational alert conditions and workspace",
    isCore: false,
  },
] as const;

export type ProductModuleId = (typeof PRODUCT_MODULES)[number]["id"];

export const MODULE_STATUS = "foundation" as const;
