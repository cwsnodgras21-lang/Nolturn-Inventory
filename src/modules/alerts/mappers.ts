import type {
  AlertSeverity,
  AlertStatus,
  AlertType,
  OperationalAlert,
} from "@/modules/alerts/types";

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function relatedHrefForAlert(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case "item":
      return `/administration/catalog/items/${entityId}`;
    case "lot":
      return `/inventory/lots/${entityId}`;
    case "recall":
      return `/inventory/recalls/${entityId}`;
    case "count_session":
      return `/inventory/counts/${entityId}`;
    case "purchase_order":
      return `/purchasing/orders/${entityId}`;
    default:
      return null;
  }
}

export function mapOperationalAlert(row: {
  id: string;
  organization_id: string;
  alert_type: string;
  severity: string;
  entity_type: string;
  entity_id: string;
  location_id: string | null;
  condition_key: string;
  title: string;
  description: string;
  status: string;
  detected_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  locations?: { name: string } | { name: string }[] | null;
}): OperationalAlert {
  return {
    id: row.id,
    organizationId: row.organization_id,
    alertType: row.alert_type as AlertType,
    severity: row.severity as AlertSeverity,
    entityType: row.entity_type,
    entityId: row.entity_id,
    locationId: row.location_id,
    conditionKey: row.condition_key,
    title: row.title,
    description: row.description,
    status: row.status as AlertStatus,
    detectedAt: row.detected_at,
    acknowledgedBy: row.acknowledged_by,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    locationName: asSingle(row.locations)?.name ?? null,
    relatedHref: relatedHrefForAlert(row.entity_type, row.entity_id),
  };
}

export function mapAlertDbError(message: string | undefined): string {
  const text = message ?? "";
  if (text.includes("permission denied")) {
    return "You do not have permission for this alert action.";
  }
  if (text.includes("row-level security")) {
    return "You do not have permission for this alert action.";
  }
  if (text.includes("operational_alerts_open_condition_uidx")) {
    return "An open alert already exists for this condition.";
  }
  return text || "Alert operation failed.";
}

export function alertTypeLabel(type: AlertType): string {
  switch (type) {
    case "low_stock":
      return "Low stock";
    case "out_of_stock":
      return "Out of stock";
    case "expiring_soon":
      return "Expiring soon";
    case "expired_stock":
      return "Expired stock";
    case "active_recall":
      return "Active recall";
    case "quarantined_inventory":
      return "Quarantined";
    case "overdue_count":
      return "Overdue count";
    case "overdue_purchase_order":
      return "Overdue PO";
    default:
      return type;
  }
}
