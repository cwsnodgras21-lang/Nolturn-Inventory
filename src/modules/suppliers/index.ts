export const MODULE_STATUS = "available" as const;

export type { Supplier, SupplierContact, SupplierStatus } from "@/modules/suppliers/types";
export { SUPPLIER_STATUSES } from "@/modules/suppliers/types";
export {
  createSupplierSchema,
  updateSupplierSchema,
  supplierContactSchema,
} from "@/modules/suppliers/schemas";
export {
  createSupplierAction,
  updateSupplierAction,
  upsertSupplierContactAction,
  deleteSupplierContactAction,
} from "@/modules/suppliers/commands";
export { listSuppliers, getSupplier, listSupplierContacts } from "@/modules/suppliers/queries";
