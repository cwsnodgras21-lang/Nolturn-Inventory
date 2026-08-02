import "server-only";

import { requirePermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { resolvePlatformContext } from "@/lib/auth/platform";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapCountLine, mapCountSession } from "@/modules/counts/mappers";
import {
  shouldRevealExpectedQuantity,
  type CountLine,
  type CountSession,
  type CountSessionStatus,
} from "@/modules/counts/types";

export async function listCountSessions(options?: {
  status?: CountSessionStatus | "all";
}): Promise<CountSession[]> {
  const context = await requirePermission("inventory.count.read");
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("count_sessions")
    .select(
      `id, organization_id, name, status, blind_count_enabled, notes, created_by, started_by, started_at,
      completed_by, completed_at, created_at, updated_at,
      count_session_locations(location_id, locations(name))`,
    )
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false });

  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;
  if (error) {
    throw new AppError("INTERNAL", "Unable to load count sessions.", 500);
  }

  return (data ?? []).map((row) =>
    mapCountSession(row as unknown as Parameters<typeof mapCountSession>[0]),
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getCountSession(sessionId: string): Promise<CountSession> {
  if (!UUID_RE.test(sessionId)) {
    throw new AppError("NOT_FOUND", "Count session not found.", 404);
  }

  const context = await requirePermission("inventory.count.read");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("count_sessions")
    .select(
      `id, organization_id, name, status, blind_count_enabled, notes, created_by, started_by, started_at,
      completed_by, completed_at, created_at, updated_at,
      count_session_locations(location_id, locations(name))`,
    )
    .eq("organization_id", context.organizationId)
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    throw new AppError("INTERNAL", "Unable to load count session.", 500);
  }
  if (!data) {
    throw new AppError("NOT_FOUND", "Count session not found.", 404);
  }

  return mapCountSession(data as unknown as Parameters<typeof mapCountSession>[0]);
}

export async function listCountLines(sessionId: string): Promise<CountLine[]> {
  const context = await requirePermission("inventory.count.read");
  const { tenant } = await resolvePlatformContext();
  const supabase = await createServerSupabaseClient();

  const session = await getCountSession(sessionId);

  const { data, error } = await supabase
    .from("count_lines")
    .select(
      `id, organization_id, count_session_id, item_id, variant_id, lot_id, location_id, storage_area_id, bin_id,
      expected_quantity, counted_quantity, variance, status, notes, counted_by, counted_at,
      reviewed_by, reviewed_at, reconciliation_transaction_id, created_at, updated_at,
      items(name, sku, units_of_measure!items_base_unit_id_fkey(symbol)),
      item_variants(name), inventory_lots(lot_number), locations(name), storage_areas(name), storage_bins(name)`,
    )
    .eq("organization_id", context.organizationId)
    .eq("count_session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new AppError("INTERNAL", "Unable to load count lines.", 500);
  }

  const revealExpected = shouldRevealExpectedQuantity({
    blindCountEnabled: session.blindCountEnabled,
    sessionStatus: session.status,
    canReview: can(tenant, "inventory.count.review"),
  });

  return (data ?? []).map((row) => {
    const line = mapCountLine(row as unknown as Parameters<typeof mapCountLine>[0]);
    if (!revealExpected) {
      return {
        ...line,
        expectedQuantity: 0,
        variance: null,
      };
    }
    return line;
  });
}
