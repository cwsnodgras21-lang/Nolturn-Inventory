"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { AppError, toSafeErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AUDIT_ACTIONS, writeAuditEvent } from "@/modules/audit";
import { mapSupplierDbError } from "@/modules/suppliers/mappers";
import {
  createSupplierSchema,
  supplierContactSchema,
  updateSupplierSchema,
} from "@/modules/suppliers/schemas";

export type SupplierActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

function fail(error: unknown): SupplierActionResult<never> {
  if (error instanceof AppError) {
    return { ok: false, error: error.message, code: error.code };
  }
  return { ok: false, error: toSafeErrorMessage(error) };
}

function revalidateSuppliers(supplierId?: string) {
  revalidatePath("/purchasing");
  revalidatePath("/purchasing/suppliers");
  revalidatePath("/purchasing/orders");
  if (supplierId) revalidatePath(`/purchasing/suppliers/${supplierId}`);
}

function emptyToNull(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function createSupplierAction(
  raw: unknown,
): Promise<SupplierActionResult<{ id: string }>> {
  try {
    const input = createSupplierSchema.parse(raw);
    const context = await requirePermission("purchasing.manage");
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        organization_id: context.organizationId,
        name: input.name,
        status: input.status,
        email: emptyToNull(input.email),
        phone: emptyToNull(input.phone),
        website: emptyToNull(input.website),
        account_number: emptyToNull(input.accountNumber),
        notes: emptyToNull(input.notes),
        created_by: context.userId,
      })
      .select("id, name")
      .single();

    if (error || !data) {
      throw new AppError("VALIDATION", mapSupplierDbError(error?.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.PURCHASING_SUPPLIER_CREATED,
      entityType: "supplier",
      entityId: data.id,
      summary: `Supplier created: ${data.name}`,
    });

    revalidateSuppliers(data.id);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateSupplierAction(
  supplierId: string,
  raw: unknown,
): Promise<SupplierActionResult> {
  try {
    const input = updateSupplierSchema.parse(raw);
    const context = await requirePermission("purchasing.manage");
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from("suppliers")
      .update({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.email !== undefined ? { email: emptyToNull(input.email) } : {}),
        ...(input.phone !== undefined ? { phone: emptyToNull(input.phone) } : {}),
        ...(input.website !== undefined ? { website: emptyToNull(input.website) } : {}),
        ...(input.accountNumber !== undefined
          ? { account_number: emptyToNull(input.accountNumber) }
          : {}),
        ...(input.notes !== undefined ? { notes: emptyToNull(input.notes) } : {}),
      })
      .eq("id", supplierId)
      .eq("organization_id", context.organizationId);

    if (error) {
      throw new AppError("VALIDATION", mapSupplierDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.PURCHASING_SUPPLIER_UPDATED,
      entityType: "supplier",
      entityId: supplierId,
      summary: "Supplier updated",
      metadata: input as Record<string, unknown>,
    });

    revalidateSuppliers(supplierId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function upsertSupplierContactAction(
  supplierId: string,
  raw: unknown,
  contactId?: string,
): Promise<SupplierActionResult<{ id: string }>> {
  try {
    const input = supplierContactSchema.parse(raw);
    const context = await requirePermission("purchasing.manage");
    const supabase = await createServerSupabaseClient();

    const payload = {
      organization_id: context.organizationId,
      supplier_id: supplierId,
      name: input.name,
      email: emptyToNull(input.email),
      phone: emptyToNull(input.phone),
      title: emptyToNull(input.title),
      is_primary: input.isPrimary,
      notes: emptyToNull(input.notes),
    };

    const result = contactId
      ? await supabase
          .from("supplier_contacts")
          .update(payload)
          .eq("id", contactId)
          .eq("supplier_id", supplierId)
          .eq("organization_id", context.organizationId)
          .select("id")
          .single()
      : await supabase.from("supplier_contacts").insert(payload).select("id").single();

    if (result.error || !result.data) {
      throw new AppError("VALIDATION", mapSupplierDbError(result.error?.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: contactId
        ? AUDIT_ACTIONS.PURCHASING_SUPPLIER_CONTACT_UPDATED
        : AUDIT_ACTIONS.PURCHASING_SUPPLIER_CONTACT_CREATED,
      entityType: "supplier_contact",
      entityId: result.data.id,
      summary: contactId ? "Supplier contact updated" : "Supplier contact created",
    });

    revalidateSuppliers(supplierId);
    return { ok: true, data: { id: result.data.id } };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteSupplierContactAction(
  supplierId: string,
  contactId: string,
): Promise<SupplierActionResult> {
  try {
    const context = await requirePermission("purchasing.manage");
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("supplier_contacts")
      .delete()
      .eq("id", contactId)
      .eq("supplier_id", supplierId)
      .eq("organization_id", context.organizationId);

    if (error) {
      throw new AppError("VALIDATION", mapSupplierDbError(error.message), 400);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.PURCHASING_SUPPLIER_CONTACT_DELETED,
      entityType: "supplier_contact",
      entityId: contactId,
      summary: "Supplier contact deleted",
    });

    revalidateSuppliers(supplierId);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}
