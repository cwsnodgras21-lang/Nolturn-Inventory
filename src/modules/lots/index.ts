export const MODULE_STATUS = "available" as const;

export type { InventoryLot, LotStatus, TrackingMode, ExpirationWindow } from "@/modules/lots/types";
export { LOT_STATUSES, TRACKING_MODES } from "@/modules/lots/types";
export {
  createLotSchema,
  updateLotSchema,
  updateItemTrackingModeSchema,
} from "@/modules/lots/schemas";
export {
  createLotAction,
  updateLotAction,
  updateItemTrackingModeAction,
} from "@/modules/lots/commands";
export {
  listLots,
  listActiveLotsForItem,
  getLot,
  listLotMovements,
} from "@/modules/lots/queries";
export type { LotMovement } from "@/modules/lots/queries";
