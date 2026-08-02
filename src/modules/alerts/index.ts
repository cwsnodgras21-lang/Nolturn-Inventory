export const MODULE_STATUS = "available" as const;

export type {
  OperationalAlert,
  AlertType,
  AlertSeverity,
  AlertStatus,
  AlertSyncResult,
} from "@/modules/alerts/types";
export { ALERT_TYPES, ALERT_SEVERITIES, ALERT_STATUSES } from "@/modules/alerts/types";
export {
  syncOperationalAlertsAction,
  acknowledgeAlertAction,
  resolveAlertAction,
} from "@/modules/alerts/commands";
export { listOperationalAlerts, countOpenAlerts } from "@/modules/alerts/queries";
export { alertTypeLabel, relatedHrefForAlert } from "@/modules/alerts/mappers";
