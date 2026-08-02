export const MODULE_STATUS = "available" as const;

export type {
  InventoryRecall,
  RecallLot,
  RecallStatus,
  RecallSeverity,
  AffectedStockRow,
} from "@/modules/recalls/types";
export { RECALL_STATUSES, RECALL_SEVERITIES } from "@/modules/recalls/types";
export {
  createRecallSchema,
  updateRecallSchema,
  recallStatusSchema,
  attachRecallLotSchema,
} from "@/modules/recalls/schemas";
export {
  createRecallAction,
  updateRecallAction,
  setRecallStatusAction,
  attachRecallLotAction,
  detachRecallLotAction,
  quarantineRecallLotsAction,
} from "@/modules/recalls/commands";
export {
  listRecalls,
  getRecall,
  listRecallLots,
  listAffectedStock,
  listRecallAuditEvents,
} from "@/modules/recalls/queries";
