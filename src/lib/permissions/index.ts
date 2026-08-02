import type { PermissionKey } from "@/lib/permissions/catalog";
import { tenantHasPermission, type TenantContext } from "@/lib/auth";

export { PERMISSION_KEYS, isPermissionKey, SYSTEM_ROLE_KEYS } from "@/lib/permissions/catalog";
export type { PermissionKey } from "@/lib/permissions/catalog";

export function can(context: TenantContext, permission: PermissionKey): boolean {
  return tenantHasPermission(context, permission);
}
