import type { Supplier, SupplierContact, SupplierStatus } from "@/modules/suppliers/types";

export function mapSupplier(row: {
  id: string;
  organization_id: string;
  name: string;
  status: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  account_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}): Supplier {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    status: row.status as SupplierStatus,
    email: row.email,
    phone: row.phone,
    website: row.website,
    accountNumber: row.account_number,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSupplierContact(row: {
  id: string;
  organization_id: string;
  supplier_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}): SupplierContact {
  return {
    id: row.id,
    organizationId: row.organization_id,
    supplierId: row.supplier_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    title: row.title,
    isPrimary: row.is_primary,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSupplierDbError(message: string | undefined): string {
  const text = message ?? "";
  if (text.includes("suppliers_org_name_uidx") || text.includes("duplicate key")) {
    return "A supplier with this name already exists.";
  }
  if (text.includes("row-level security")) {
    return "You do not have permission for this supplier action.";
  }
  return text || "Supplier operation failed.";
}
