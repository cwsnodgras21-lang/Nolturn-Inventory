export const ALERT_TYPES = [
  "low_stock",
  "out_of_stock",
  "expiring_soon",
  "expired_stock",
  "active_recall",
  "quarantined_inventory",
  "overdue_count",
  "overdue_purchase_order",
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_SEVERITIES = [
  "informational",
  "low",
  "medium",
  "high",
  "critical",
] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = ["open", "acknowledged", "resolved"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export type OperationalAlert = {
  id: string;
  organizationId: string;
  alertType: AlertType;
  severity: AlertSeverity;
  entityType: string;
  entityId: string;
  locationId: string | null;
  conditionKey: string;
  title: string;
  description: string;
  status: AlertStatus;
  detectedAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  locationName?: string | null;
  relatedHref?: string | null;
};

export type AlertSyncResult = {
  created: number;
  updated: number;
  resolved: number;
  activeConditions: number;
};
