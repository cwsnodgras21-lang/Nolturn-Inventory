"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/env";
import { AppError, toSafeErrorMessage } from "@/lib/errors";
import { requirePermission, requireTenantContext, requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AUDIT_ACTIONS, writeAuditEvent } from "@/modules/audit";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from "@/modules/organizations/schemas";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function createOrganizationAction(
  raw: unknown,
): Promise<ActionResult<{ organizationId: string }>> {
  try {
    const user = await requireUser();
    const input = createOrganizationSchema.parse(raw);
    const supabase = await createServerSupabaseClient();
    const correlationId = crypto.randomUUID();

    const { data: organizationId, error } = await supabase.rpc("provision_organization", {
      p_name: input.name,
      p_timezone: input.timezone,
      p_create_default_location: input.createDefaultLocation,
      p_correlation_id: correlationId,
    });

    if (error || !organizationId) {
      throw new AppError("INTERNAL", error?.message ?? "Unable to create organization.", 500);
    }

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });

    await writeAuditEvent({
      organizationId,
      actorUserId: user.id,
      action: AUDIT_ACTIONS.ACTIVE_ORGANIZATION_CHANGED,
      entityType: "organization",
      entityId: organizationId,
      summary: "Active organization set after create",
      correlationId,
    });

    revalidatePath("/", "layout");
    return { ok: true, data: { organizationId } };
  } catch (error) {
    return {
      ok: false,
      error: toSafeErrorMessage(error),
      code: error instanceof AppError ? error.code : undefined,
    };
  }
}

export async function switchOrganizationAction(
  organizationId: string,
): Promise<ActionResult<{ organizationId: string }>> {
  try {
    const user = await requireUser();
    const context = await requireTenantContext(organizationId);

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, context.organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: user.id,
      action: AUDIT_ACTIONS.ACTIVE_ORGANIZATION_CHANGED,
      entityType: "organization",
      entityId: context.organizationId,
      summary: "Active organization switched",
    });

    revalidatePath("/", "layout");
    return { ok: true, data: { organizationId: context.organizationId } };
  } catch (error) {
    return {
      ok: false,
      error: toSafeErrorMessage(error),
      code: error instanceof AppError ? error.code : undefined,
    };
  }
}

export async function updateOrganizationAction(raw: unknown): Promise<ActionResult> {
  try {
    const input = updateOrganizationSchema.parse(raw);
    const context = await requirePermission("organization.manage");
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from("organizations")
      .update({
        ...(input.name ? { name: input.name } : {}),
        ...(input.timezone ? { timezone: input.timezone } : {}),
        ...(input.status ? { status: input.status } : {}),
      })
      .eq("id", context.organizationId);

    if (error) {
      throw new AppError("INTERNAL", "Unable to update organization.", 500);
    }

    await writeAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.ORGANIZATION_UPDATED,
      entityType: "organization",
      entityId: context.organizationId,
      summary: "Organization profile updated",
      metadata: input as Record<string, unknown>,
    });

    revalidatePath("/administration");
    return { ok: true, data: undefined };
  } catch (error) {
    return {
      ok: false,
      error: toSafeErrorMessage(error),
      code: error instanceof AppError ? error.code : undefined,
    };
  }
}

export async function listUserMemberships() {
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("id, status, organization_id, organizations!inner(id, name, slug, status)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    throw new AppError("INTERNAL", "Unable to load memberships.", 500);
  }

  return (data ?? []).map((row) => {
    const raw = row as unknown as {
      id: string;
      organization_id: string;
      organizations: { id: string; name: string; slug: string; status: string } | Array<{
        id: string;
        name: string;
        slug: string;
        status: string;
      }>;
    };
    const org = asSingle(raw.organizations);
    return {
      membershipId: raw.id,
      organizationId: raw.organization_id,
      organizationName: org?.name ?? "Organization",
      organizationSlug: org?.slug ?? "",
      organizationStatus: org?.status ?? "active",
    };
  });
}
