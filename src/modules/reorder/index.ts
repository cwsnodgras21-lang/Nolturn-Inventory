export const MODULE_STATUS = "available" as const;

export type {
  ReorderRule,
  ReorderStatus,
  RestockSuggestion,
  StockState,
} from "@/modules/reorder/types";
export { REORDER_STATUSES, STOCK_STATES } from "@/modules/reorder/types";
export {
  upsertReorderRuleSchema,
  updateReorderRuleSchema,
  createRestockDraftOrdersSchema,
} from "@/modules/reorder/schemas";
export {
  upsertReorderRuleAction,
  updateReorderRuleAction,
  deleteReorderRuleAction,
  createRestockDraftPurchaseOrdersAction,
} from "@/modules/reorder/commands";
export { listReorderRules, listRestockSuggestions } from "@/modules/reorder/queries";
export {
  isUsableLot,
  stockStateFor,
  suggestedReorderQuantity,
  effectiveReorderRule,
  sumAvailableAtLocation,
} from "@/modules/reorder/calc";
