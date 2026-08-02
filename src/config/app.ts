import type { PermissionKey } from "@/lib/permissions/catalog";

export const appConfig = {
  name: "Nolt Inventory",
  shortName: "Nolt",
  company: "NolTurn Solutions",
  phase: 3.3,
  phaseLabel: "Phase 3.3 — Lot and expiration tracking",
} as const;

export type NavItem = {
  href: string;
  label: string;
  description: string;
  status: "available" | "planned";
  /** If set, user needs any of these permissions to see the link. */
  anyOfPermissions?: PermissionKey[];
};

export const platformNav: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    description: "Operational overview",
    status: "available",
  },
  {
    href: "/inventory",
    label: "Inventory",
    description: "Stock and transactions",
    status: "available",
    anyOfPermissions: ["inventory.read"],
  },
  {
    href: "/purchasing",
    label: "Purchasing",
    description: "Suppliers, orders, and receiving",
    status: "available",
    anyOfPermissions: ["purchasing.read"],
  },
  {
    href: "/nolt",
    label: "Nolt",
    description: "Intelligence recommendations",
    status: "planned",
  },
  {
    href: "/administration",
    label: "Administration",
    description: "Org settings and access",
    status: "available",
    anyOfPermissions: [
      "organization.read",
      "members.read",
      "roles.read",
      "locations.read",
      "audit.read",
      "settings.read",
      "catalog.read",
      "inventory.storage.read",
      "inventory.read",
    ],
  },
];

export const administrationNav: NavItem[] = [
  {
    href: "/administration",
    label: "Organization",
    description: "Profile and status",
    status: "available",
    anyOfPermissions: ["organization.read", "settings.read"],
  },
  {
    href: "/administration/locations",
    label: "Locations",
    description: "Sites and facilities",
    status: "available",
    anyOfPermissions: ["locations.read"],
  },
  {
    href: "/administration/storage",
    label: "Storage",
    description: "Areas and bins",
    status: "available",
    anyOfPermissions: ["inventory.storage.read"],
  },
  {
    href: "/administration/catalog/units",
    label: "Units",
    description: "Units of measure",
    status: "available",
    anyOfPermissions: ["catalog.read"],
  },
  {
    href: "/administration/catalog/categories",
    label: "Categories",
    description: "Item categories",
    status: "available",
    anyOfPermissions: ["catalog.read"],
  },
  {
    href: "/administration/catalog/items",
    label: "Items",
    description: "Catalog items and identifiers",
    status: "available",
    anyOfPermissions: ["catalog.read"],
  },
  {
    href: "/administration/members",
    label: "Members",
    description: "People and access",
    status: "available",
    anyOfPermissions: ["members.read"],
  },
  {
    href: "/administration/roles",
    label: "Roles",
    description: "Roles and permissions",
    status: "available",
    anyOfPermissions: ["roles.read"],
  },
  {
    href: "/administration/audit",
    label: "Audit log",
    description: "Security and change history",
    status: "available",
    anyOfPermissions: ["audit.read"],
  },
];
