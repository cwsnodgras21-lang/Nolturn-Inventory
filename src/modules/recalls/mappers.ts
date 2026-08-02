import type {
  InventoryRecall,
  RecallLot,
  RecallSeverity,
  RecallStatus,
} from "@/modules/recalls/types";

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function mapRecall(row: {
  id: string;
  organization_id: string;
  title: string;
  recall_number: string;
  external_reference: string | null;
  source: string;
  severity: string;
  status: string;
  announced_date: string | null;
  notes: string | null;
  created_by: string | null;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  inventory_recall_lots?: Array<{ id: string }> | null;
}): InventoryRecall {
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    recallNumber: row.recall_number,
    externalReference: row.external_reference,
    source: row.source,
    severity: row.severity as RecallSeverity,
    status: row.status as RecallStatus,
    announcedDate: row.announced_date,
    notes: row.notes,
    createdBy: row.created_by,
    closedBy: row.closed_by,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lotCount: row.inventory_recall_lots?.length,
  };
}

export function mapRecallLot(row: {
  id: string;
  organization_id: string;
  recall_id: string;
  lot_id: string;
  created_at: string;
  inventory_lots?:
    | {
        lot_number: string;
        status: string;
        expiration_date: string | null;
        item_id: string;
        items?:
          | { name: string; sku: string }
          | { name: string; sku: string }[]
          | null;
        item_variants?: { name: string } | { name: string }[] | null;
      }
    | {
        lot_number: string;
        status: string;
        expiration_date: string | null;
        item_id: string;
        items?:
          | { name: string; sku: string }
          | { name: string; sku: string }[]
          | null;
        item_variants?: { name: string } | { name: string }[] | null;
      }[]
    | null;
}): RecallLot {
  const lot = asSingle(row.inventory_lots);
  const item = asSingle(lot?.items);
  return {
    id: row.id,
    organizationId: row.organization_id,
    recallId: row.recall_id,
    lotId: row.lot_id,
    createdAt: row.created_at,
    lotNumber: lot?.lot_number ?? null,
    lotStatus: lot?.status ?? null,
    expirationDate: lot?.expiration_date ?? null,
    itemId: lot?.item_id ?? null,
    itemName: item?.name ?? null,
    itemSku: item?.sku ?? null,
    variantName: asSingle(lot?.item_variants)?.name ?? null,
  };
}

export function mapRecallDbError(message: string | undefined): string {
  const text = message ?? "";
  if (text.includes("inventory_recalls_org_number_uidx") || text.includes("duplicate key")) {
    return "A recall with this number already exists.";
  }
  if (text.includes("inventory_recall_lots") && text.includes("unique")) {
    return "This lot is already attached to the recall.";
  }
  if (text.includes("cannot attach lots to a closed recall")) {
    return "Cannot attach lots to a closed recall.";
  }
  if (text.includes("recall and lots must belong to the same organization")) {
    return "Recall and lots must belong to the same organization.";
  }
  if (text.includes("closed recalls cannot change status")) {
    return "Closed recalls cannot change status.";
  }
  if (text.includes("only draft or active recalls can quarantine")) {
    return "Only draft or active recalls can quarantine lots.";
  }
  if (text.includes("permission denied")) {
    return "You do not have permission for this recall action.";
  }
  if (text.includes("row-level security")) {
    return "You do not have permission for this recall action.";
  }
  return text || "Recall operation failed.";
}
