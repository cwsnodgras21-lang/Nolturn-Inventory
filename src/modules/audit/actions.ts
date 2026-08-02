export const AUDIT_ACTIONS = {
  ORGANIZATION_CREATED: "organization.created",
  MEMBERSHIP_CREATED: "membership.created",
  MEMBERSHIP_STATUS_CHANGED: "membership.status_changed",
  ROLE_ASSIGNED: "role.assigned",
  ROLE_REMOVED: "role.removed",
  LOCATION_CREATED: "location.created",
  LOCATION_UPDATED: "location.updated",
  ACTIVE_ORGANIZATION_CHANGED: "active_organization.changed",
  SESSION_SIGNED_IN: "session.signed_in",
  SESSION_SIGNED_OUT: "session.signed_out",
  CATALOG_UNIT_CREATED: "catalog.unit.created",
  CATALOG_UNIT_UPDATED: "catalog.unit.updated",
  CATALOG_UNIT_STATUS_CHANGED: "catalog.unit.status_changed",
  CATALOG_CATEGORY_CREATED: "catalog.category.created",
  CATALOG_CATEGORY_UPDATED: "catalog.category.updated",
  CATALOG_CATEGORY_REPARENTED: "catalog.category.reparented",
  CATALOG_CATEGORY_STATUS_CHANGED: "catalog.category.status_changed",
  CATALOG_ITEM_CREATED: "catalog.item.created",
  CATALOG_ITEM_UPDATED: "catalog.item.updated",
  CATALOG_ITEM_STATUS_CHANGED: "catalog.item.status_changed",
  CATALOG_VARIANT_CREATED: "catalog.variant.created",
  CATALOG_VARIANT_UPDATED: "catalog.variant.updated",
  CATALOG_CONVERSION_CREATED: "catalog.conversion.created",
  CATALOG_CONVERSION_DELETED: "catalog.conversion.deleted",
  CATALOG_IDENTIFIER_CREATED: "catalog.identifier.created",
  CATALOG_IDENTIFIER_UPDATED: "catalog.identifier.updated",
  CATALOG_IDENTIFIER_DELETED: "catalog.identifier.deleted",
  INVENTORY_STORAGE_AREA_CREATED: "inventory.storage_area.created",
  INVENTORY_STORAGE_AREA_UPDATED: "inventory.storage_area.updated",
  INVENTORY_STORAGE_AREA_REPARENTED: "inventory.storage_area.reparented",
  INVENTORY_STORAGE_AREA_STATUS_CHANGED: "inventory.storage_area.status_changed",
  INVENTORY_STORAGE_BIN_CREATED: "inventory.storage_bin.created",
  INVENTORY_STORAGE_BIN_UPDATED: "inventory.storage_bin.updated",
  INVENTORY_STORAGE_BIN_STATUS_CHANGED: "inventory.storage_bin.status_changed",
  INVENTORY_TRANSACTION_CREATED: "inventory.transaction.created",
  INVENTORY_TRANSACTION_UPDATED: "inventory.transaction.updated",
  INVENTORY_TRANSACTION_CANCELLED: "inventory.transaction.cancelled",
  INVENTORY_TRANSACTION_COMPLETED: "inventory.transaction.completed",
  INVENTORY_TRANSACTION_REVERSED: "inventory.transaction.reversed",
  INVENTORY_TRANSACTION_LINE_ADDED: "inventory.transaction_line.added",
  INVENTORY_TRANSACTION_LINE_UPDATED: "inventory.transaction_line.updated",
  INVENTORY_TRANSACTION_LINE_REMOVED: "inventory.transaction_line.removed",
  INVENTORY_RECEIPT_COMPLETED: "inventory.receipt.completed",
  INVENTORY_CONSUMPTION_COMPLETED: "inventory.consumption.completed",
  INVENTORY_TRANSFER_COMPLETED: "inventory.transfer.completed",
  INVENTORY_NEGATIVE_ADJUSTMENT_COMPLETED: "inventory.negative_adjustment.completed",
  INVENTORY_COUNT_CREATED: "inventory.count.created",
  INVENTORY_COUNT_UPDATED: "inventory.count.updated",
  INVENTORY_COUNT_CANCELLED: "inventory.count.cancelled",
  INVENTORY_COUNT_STARTED: "inventory.count.started",
  INVENTORY_COUNT_LINE_ADDED: "inventory.count_line.added",
  INVENTORY_COUNT_LINE_RECORDED: "inventory.count_line.recorded",
  INVENTORY_COUNT_SUBMITTED: "inventory.count.submitted",
  INVENTORY_COUNT_RETURNED: "inventory.count.returned",
  INVENTORY_COUNT_LINE_REVIEWED: "inventory.count_line.reviewed",
  INVENTORY_COUNT_COMPLETED: "inventory.count.completed",
  PURCHASING_SUPPLIER_CREATED: "purchasing.supplier.created",
  PURCHASING_SUPPLIER_UPDATED: "purchasing.supplier.updated",
  PURCHASING_SUPPLIER_CONTACT_CREATED: "purchasing.supplier_contact.created",
  PURCHASING_SUPPLIER_CONTACT_UPDATED: "purchasing.supplier_contact.updated",
  PURCHASING_SUPPLIER_CONTACT_DELETED: "purchasing.supplier_contact.deleted",
  PURCHASING_PO_CREATED: "purchasing.po.created",
  PURCHASING_PO_UPDATED: "purchasing.po.updated",
  PURCHASING_PO_LINE_ADDED: "purchasing.po_line.added",
  PURCHASING_PO_LINE_REMOVED: "purchasing.po_line.removed",
  PURCHASING_PO_SUBMITTED: "purchasing.po.submitted",
  PURCHASING_PO_CANCELLED: "purchasing.po.cancelled",
  PURCHASING_PO_RECEIVED: "purchasing.po.received",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

const SECRET_METADATA_KEYS = [
  "password",
  "token",
  "access_token",
  "refresh_token",
  "service_role",
  "api_key",
  "secret",
  "authorization",
];

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!metadata) return {};
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SECRET_METADATA_KEYS.some((secret) => key.toLowerCase().includes(secret))) {
      continue;
    }
    cleaned[key] = value;
  }
  return cleaned;
}
