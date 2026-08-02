import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { sanitizeAuditMetadata, type AuditAction } from "@/modules/audit/actions";
import type { Json } from "@/lib/supabase/types";

export type AuditEventListItem = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string | null;
  actor_user_id: string | null;
  created_at: string;
  metadata: Json;
};

export async function writeAuditEvent(input: {
  organizationId: string;
  actorUserId: string;
  action: AuditAction | string;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  metadata?: Record<string, unknown>;
  correlationId?: string | null;
  actorType?: "user" | "system" | "service";
}) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("audit_events").insert({
    organization_id: input.organizationId,
    actor_user_id: input.actorUserId,
    actor_type: input.actorType ?? "user",
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    summary: input.summary ?? null,
    metadata: sanitizeAuditMetadata(input.metadata) as Json,
    correlation_id: input.correlationId ?? null,
  });

  if (error) {
    throw new AppError("INTERNAL", "Failed to write audit event.", 500);
  }
}

export async function listAuditEvents(
  organizationId: string,
  limit = 50,
): Promise<AuditEventListItem[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("audit_events")
    .select("id, action, entity_type, entity_id, summary, actor_user_id, created_at, metadata")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new AppError("INTERNAL", "Unable to load audit events.", 500);
  }

  return (data ?? []) as AuditEventListItem[];
}
