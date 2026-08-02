/**
 * Permission catalog — must stay synchronized with seeded public.permissions keys.
 * Tests fail if this list drifts from the database seed.
 */
export const PERMISSION_KEYS = [
  "organization.read",
  "organization.manage",
  "members.read",
  "members.manage",
  "roles.read",
  "roles.manage",
  "locations.read",
  "locations.manage",
  "audit.read",
  "settings.read",
  "settings.manage",
  "catalog.read",
  "catalog.manage",
  "inventory.storage.read",
  "inventory.storage.manage",
  "inventory.read",
  "inventory.adjust",
  "inventory.receive",
  "inventory.consume",
  "inventory.transfer",
  "inventory.reverse",
  "inventory.count.read",
  "inventory.count.perform",
  "inventory.count.review",
  "purchasing.read",
  "purchasing.manage",
  "purchasing.receive",
  "inventory.lots.read",
  "inventory.lots.manage",
  "inventory.recalls.read",
  "inventory.recalls.manage",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}

export const SYSTEM_ROLE_KEYS = [
  "organization_owner",
  "organization_administrator",
  "inventory_manager",
  "purchasing_manager",
  "location_manager",
  "staff",
  "read_only",
] as const;

export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];
