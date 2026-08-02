import "server-only";

import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapSupplier, mapSupplierContact } from "@/modules/suppliers/mappers";
import type { Supplier, SupplierContact, SupplierStatus } from "@/modules/suppliers/types";

export async function listSuppliers(options?: {
  status?: SupplierStatus | "all";
}): Promise<Supplier[]> {
  const context = await requirePermission("purchasing.read");
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("suppliers")
    .select(
      "id, organization_id, name, status, email, phone, website, account_number, notes, created_by, created_at, updated_at",
    )
    .eq("organization_id", context.organizationId)
    .order("name", { ascending: true });

  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;
  if (error) throw new AppError("INTERNAL", "Unable to load suppliers.", 500);
  return (data ?? []).map(mapSupplier);
}

export async function getSupplier(supplierId: string): Promise<Supplier> {
  const context = await requirePermission("purchasing.read");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select(
      "id, organization_id, name, status, email, phone, website, account_number, notes, created_by, created_at, updated_at",
    )
    .eq("organization_id", context.organizationId)
    .eq("id", supplierId)
    .maybeSingle();

  if (error) throw new AppError("INTERNAL", "Unable to load supplier.", 500);
  if (!data) throw new AppError("NOT_FOUND", "Supplier not found.", 404);
  return mapSupplier(data);
}

export async function listSupplierContacts(supplierId: string): Promise<SupplierContact[]> {
  const context = await requirePermission("purchasing.read");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("supplier_contacts")
    .select(
      "id, organization_id, supplier_id, name, email, phone, title, is_primary, notes, created_at, updated_at",
    )
    .eq("organization_id", context.organizationId)
    .eq("supplier_id", supplierId)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw new AppError("INTERNAL", "Unable to load supplier contacts.", 500);
  return (data ?? []).map(mapSupplierContact);
}
