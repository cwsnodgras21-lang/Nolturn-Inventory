import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && anon && service && process.env.RUN_RLS_TESTS === "1");

async function signIn(email: string, password = "password123") {
  const client = createClient(url!, anon!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error("no session");
  return { client, userId: data.user.id };
}

describe.skipIf(!enabled)("Phase 3.1 inventory counts RLS and workflow", () => {
  let admin: SupabaseClient;
  let orgA: string;
  let orgB: string;
  let primaryA: string;
  let storageA: string;
  let alcoholId: string;
  let alcoholBase: string;
  let fridgeArea: string;
  let fridgeBin: string;
  let warehouseArea: string;
  let mLUnit: string;

  beforeAll(async () => {
    admin = createClient(url!, service!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: orgs } = await admin.from("organizations").select("id, slug");
    orgA = orgs?.find((o) => o.slug.startsWith("north-clinic"))?.id ?? "";
    orgB = orgs?.find((o) => o.slug.startsWith("south-wellness"))?.id ?? "";
    if (!orgA || !orgB) throw new Error("Bootstrap orgs missing.");

    const { data: locs } = await admin.from("locations").select("id, code").eq("organization_id", orgA);
    primaryA = locs?.find((l) => l.code === "PRIMARY")?.id ?? "";
    storageA = locs?.find((l) => l.code === "STORAGE")?.id ?? "";

    const { data: items } = await admin
      .from("items")
      .select("id, sku, base_unit_id")
      .eq("organization_id", orgA);
    const alcohol = items?.find((i) => i.sku === "INJ-IPA-500");
    alcoholId = alcohol?.id ?? "";
    alcoholBase = alcohol?.base_unit_id ?? "";

    const { data: areas } = await admin
      .from("storage_areas")
      .select("id, code, location_id")
      .eq("organization_id", orgA);
    fridgeArea = areas?.find((a) => a.code === "MED-FRIDGE" && a.location_id === primaryA)?.id ?? "";
    warehouseArea = areas?.find((a) => a.code === "WH-MAIN" && a.location_id === storageA)?.id ?? "";

    const { data: bins } = await admin
      .from("storage_bins")
      .select("id, code")
      .eq("storage_area_id", fridgeArea);
    fridgeBin = bins?.find((b) => b.code === "MED-FRIDGE-D1")?.id ?? "";

    const { data: units } = await admin
      .from("units_of_measure")
      .select("id, symbol")
      .eq("organization_id", orgA);
    mLUnit = units?.find((u) => u.symbol === "mL")?.id ?? "";

    if (!primaryA || !storageA || !alcoholId || !fridgeArea || !fridgeBin || !warehouseArea) {
      throw new Error("Bootstrap count fixtures missing.");
    }
  });

  async function balanceQty(dims: {
    itemId: string;
    locationId: string;
    storageAreaId: string;
    binId?: string | null;
  }) {
    let query = admin
      .from("inventory_balances")
      .select("quantity_on_hand")
      .eq("organization_id", orgA)
      .eq("item_id", dims.itemId)
      .eq("location_id", dims.locationId)
      .eq("storage_area_id", dims.storageAreaId)
      .is("variant_id", null);
    query = dims.binId ? query.eq("bin_id", dims.binId) : query.is("bin_id", null);
    const { data } = await query.maybeSingle();
    return Number(data?.quantity_on_hand ?? 0);
  }

  async function seedStock(client: SupabaseClient, qty: number) {
    const { data: txn } = await client
      .from("inventory_transactions")
      .insert({
        organization_id: orgA,
        transaction_type: "positive_adjustment",
        status: "draft",
        transaction_number: "",
        notes: `count seed ${Date.now()}`,
      })
      .select("id")
      .single();
    await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: txn!.id,
      line_number: 1,
      item_id: alcoholId,
      entered_quantity: qty,
      entered_unit_id: mLUnit || alcoholBase,
      conversion_multiplier: 1,
      base_quantity: qty,
      destination_location_id: primaryA,
      destination_storage_area_id: fridgeArea,
      destination_bin_id: fridgeBin,
    });
    const completed = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: txn!.id,
    });
    expect(completed.error).toBeNull();
  }

  async function createDraftCount(
    client: SupabaseClient,
    opts: { locations?: string[]; blind?: boolean; name?: string } = {},
  ) {
    const { data: session, error } = await client
      .from("count_sessions")
      .insert({
        organization_id: orgA,
        name: opts.name ?? `Count ${Date.now()}`,
        status: "draft",
        blind_count_enabled: opts.blind ?? false,
      })
      .select("id, status, blind_count_enabled")
      .single();
    expect(error).toBeNull();

    const locationIds = opts.locations ?? [primaryA];
    const { error: locError } = await client.from("count_session_locations").insert(
      locationIds.map((location_id) => ({
        organization_id: orgA,
        count_session_id: session!.id,
        location_id,
      })),
    );
    expect(locError).toBeNull();
    return session!;
  }

  it("role mappings include inventory count permissions", async () => {
    const { data } = await admin
      .from("roles")
      .select("key, role_permissions(permissions(key))")
      .eq("organization_id", orgA)
      .in("key", [
        "inventory_manager",
        "location_manager",
        "staff",
        "read_only",
        "purchasing_manager",
      ]);

    const keysFor = (roleKey: string) => {
      const role = (data ?? []).find((row) => row.key === roleKey) as
        | {
            role_permissions: Array<{ permissions: { key: string } | { key: string }[] | null }>;
          }
        | undefined;
      return new Set(
        (role?.role_permissions ?? []).map((rp) => {
          const permission = Array.isArray(rp.permissions) ? rp.permissions[0] : rp.permissions;
          return permission?.key;
        }),
      );
    };

    expect(keysFor("inventory_manager").has("inventory.count.review")).toBe(true);
    expect(keysFor("location_manager").has("inventory.count.perform")).toBe(true);
    expect(keysFor("staff").has("inventory.count.perform")).toBe(true);
    expect(keysFor("staff").has("inventory.count.review")).toBe(false);
    expect(keysFor("read_only").has("inventory.count.read")).toBe(true);
    expect(keysFor("read_only").has("inventory.count.perform")).toBe(false);
    expect(keysFor("purchasing_manager").has("inventory.count.read")).toBe(false);
  });

  it("freezes expected quantity and ignores later movements", async () => {
    const { client } = await signIn("owner@nolt.local");
    await seedStock(client, 40);
    const before = await balanceQty({
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: fridgeBin,
    });

    const session = await createDraftCount(client);
    const started = await client.rpc("start_count_session", { p_session_id: session.id });
    expect(started.error).toBeNull();

    const { data: lines } = await admin
      .from("count_lines")
      .select("id, expected_quantity, item_id, bin_id")
      .eq("count_session_id", session.id)
      .eq("item_id", alcoholId)
      .eq("bin_id", fridgeBin);
    expect((lines ?? []).length).toBeGreaterThan(0);
    const line = lines?.[0];
    expect(line).toBeTruthy();
    if (!line) throw new Error("missing count line");
    expect(Number(line.expected_quantity)).toBe(before);

    // Later movement must not change frozen expected.
    await seedStock(client, 15);
    const { data: afterMove } = await admin
      .from("count_lines")
      .select("expected_quantity")
      .eq("id", line.id)
      .single();
    expect(Number(afterMove?.expected_quantity)).toBe(before);

    const { error: tamper } = await client
      .from("count_lines")
      .update({ expected_quantity: 1 })
      .eq("id", line.id);
    expect(tamper).toBeTruthy();
  });

  it("blind count keeps expected in DB while workflow still calculates variance on count", async () => {
    const { client } = await signIn("owner@nolt.local");
    await seedStock(client, 12);
    const session = await createDraftCount(client, { blind: true });
    const started = await client.rpc("start_count_session", { p_session_id: session.id });
    expect(started.error).toBeNull();
    expect(started.data?.blind_count_enabled).toBe(true);

    const { data: line } = await admin
      .from("count_lines")
      .select("id, expected_quantity")
      .eq("count_session_id", session.id)
      .eq("item_id", alcoholId)
      .eq("bin_id", fridgeBin)
      .maybeSingle();
    expect(line).toBeTruthy();
    expect(Number(line!.expected_quantity)).toBeGreaterThan(0);

    const counted = Number(line!.expected_quantity) - 2;
    const { error } = await client
      .from("count_lines")
      .update({
        counted_quantity: counted,
        status: "counted",
      })
      .eq("id", line!.id);
    expect(error).toBeNull();

    const { data: after } = await admin
      .from("count_lines")
      .select("variance, expected_quantity, counted_quantity")
      .eq("id", line!.id)
      .single();
    expect(Number(after?.variance)).toBe(counted - Number(after?.expected_quantity));
  });

  it("review approval creates adjustment transactions and updates balances", async () => {
    const { client, userId } = await signIn("owner@nolt.local");
    await admin.from("items").update({ allow_negative_stock: false }).eq("id", alcoholId);

    const dims = {
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: fridgeBin,
    };
    // Establish a known balance.
    const current = await balanceQty(dims);
    if (current > 0) {
      const { data: drain } = await client
        .from("inventory_transactions")
        .insert({
          organization_id: orgA,
          transaction_type: "consumption",
          status: "draft",
          transaction_number: "",
          notes: "drain for count",
        })
        .select("id")
        .single();
      await client.from("inventory_transaction_lines").insert({
        organization_id: orgA,
        transaction_id: drain!.id,
        line_number: 1,
        item_id: alcoholId,
        entered_quantity: current,
        entered_unit_id: mLUnit || alcoholBase,
        conversion_multiplier: 1,
        base_quantity: current,
        source_location_id: primaryA,
        source_storage_area_id: fridgeArea,
        source_bin_id: fridgeBin,
      });
      await client.rpc("complete_inventory_transaction", { p_transaction_id: drain!.id });
    }
    await seedStock(client, 20);
    expect(await balanceQty(dims)).toBe(20);

    const session = await createDraftCount(client, { name: `Reconcile ${Date.now()}` });
    await client.rpc("start_count_session", { p_session_id: session.id });

    const { data: lines } = await admin
      .from("count_lines")
      .select("id, expected_quantity")
      .eq("count_session_id", session.id)
      .eq("bin_id", fridgeBin)
      .eq("item_id", alcoholId);
    const target = lines?.[0];
    expect(target).toBeTruthy();
    if (!target) throw new Error("missing target count line");

    await client
      .from("count_lines")
      .update({ counted_quantity: 17, status: "counted" })
      .eq("id", target.id);

    // Count any other lines at expected to allow submit.
    const { data: others } = await admin
      .from("count_lines")
      .select("id, expected_quantity")
      .eq("count_session_id", session.id)
      .neq("id", target.id);
    for (const other of others ?? []) {
      await client
        .from("count_lines")
        .update({
          counted_quantity: Number(other.expected_quantity),
          status: "counted",
        })
        .eq("id", other.id);
    }

    const submitted = await client.rpc("submit_count_session_for_review", {
      p_session_id: session.id,
    });
    expect(submitted.error).toBeNull();

    for (const line of [target, ...(others ?? [])]) {
      const reviewed = await client.rpc("review_count_line", {
        p_line_id: line.id,
        p_decision: "accepted",
      });
      expect(reviewed.error).toBeNull();
    }

    const approved = await client.rpc("approve_count_session_reconciliation", {
      p_session_id: session.id,
    });
    expect(approved.error).toBeNull();
    expect(approved.data?.status).toBe("completed");
    expect(await balanceQty(dims)).toBe(17);

    const { data: lineAfter } = await admin
      .from("count_lines")
      .select("variance, reconciliation_transaction_id")
      .eq("id", target.id)
      .single();
    expect(Number(lineAfter?.variance)).toBe(-3);
    expect(lineAfter?.reconciliation_transaction_id).toBeTruthy();

    const { data: txn } = await admin
      .from("inventory_transactions")
      .select("transaction_type, status, notes")
      .eq("id", lineAfter!.reconciliation_transaction_id!)
      .single();
    expect(txn?.transaction_type).toBe("negative_adjustment");
    expect(txn?.status).toBe("completed");

    const duplicate = await client.rpc("approve_count_session_reconciliation", {
      p_session_id: session.id,
    });
    expect(duplicate.error).toBeTruthy();

    const { error: auditError } = await client.from("audit_events").insert({
      organization_id: orgA,
      actor_user_id: userId,
      actor_type: "user",
      action: "inventory.count.completed",
      entity_type: "count_session",
      entity_id: session.id,
      summary: "Count reconciliation approved",
    });
    expect(auditError).toBeNull();
  });

  it("restricted user cannot assign inaccessible locations", async () => {
    const restricted = await signIn("restricted@nolt.local");
    const { data: session } = await restricted.client
      .from("count_sessions")
      .insert({
        organization_id: orgA,
        name: `Restricted ${Date.now()}`,
        status: "draft",
      })
      .select("id")
      .single();

    const { error } = await restricted.client.from("count_session_locations").insert({
      organization_id: orgA,
      count_session_id: session!.id,
      location_id: storageA,
    });
    expect(error).toBeTruthy();

    const { error: ok } = await restricted.client.from("count_session_locations").insert({
      organization_id: orgA,
      count_session_id: session!.id,
      location_id: primaryA,
    });
    expect(ok).toBeNull();
  });

  it("staff can perform but cannot review or approve", async () => {
    const owner = await signIn("owner@nolt.local");
    await seedStock(owner.client, 8);
    const session = await createDraftCount(owner.client);
    await owner.client.rpc("start_count_session", { p_session_id: session.id });

    const staff = await signIn("multi@nolt.local");
    const { data: line } = await admin
      .from("count_lines")
      .select("id, expected_quantity")
      .eq("count_session_id", session.id)
      .limit(1)
      .maybeSingle();

    const { error: recordError } = await staff.client
      .from("count_lines")
      .update({
        counted_quantity: Number(line!.expected_quantity),
        status: "counted",
      })
      .eq("id", line!.id);
    expect(recordError).toBeNull();

    // Count remaining lines as owner so submit can succeed.
    const { data: remaining } = await admin
      .from("count_lines")
      .select("id, expected_quantity")
      .eq("count_session_id", session.id)
      .neq("id", line!.id);
    for (const row of remaining ?? []) {
      await owner.client
        .from("count_lines")
        .update({
          counted_quantity: Number(row.expected_quantity),
          status: "counted",
        })
        .eq("id", row.id);
    }
    await owner.client.rpc("submit_count_session_for_review", { p_session_id: session.id });

    const review = await staff.client.rpc("review_count_line", {
      p_line_id: line!.id,
      p_decision: "accepted",
    });
    expect(review.error).toBeTruthy();

    const approve = await staff.client.rpc("approve_count_session_reconciliation", {
      p_session_id: session.id,
    });
    expect(approve.error).toBeTruthy();
  });

  it("blocks cross-tenant count access", async () => {
    const ownerB = await signIn("other-owner@nolt.local");
    const ownerA = await signIn("owner@nolt.local");
    const session = await createDraftCount(ownerA.client);

    const { data } = await ownerB.client
      .from("count_sessions")
      .select("id")
      .eq("id", session.id);
    expect(data ?? []).toHaveLength(0);

    const start = await ownerB.client.rpc("start_count_session", { p_session_id: session.id });
    expect(start.error).toBeTruthy();
  });

  it("return for correction resets review decisions", async () => {
    const { client } = await signIn("owner@nolt.local");
    await seedStock(client, 5);
    const session = await createDraftCount(client);
    await client.rpc("start_count_session", { p_session_id: session.id });

    const { data: lines } = await admin
      .from("count_lines")
      .select("id, expected_quantity")
      .eq("count_session_id", session.id);
    for (const line of lines ?? []) {
      await client
        .from("count_lines")
        .update({
          counted_quantity: Number(line.expected_quantity),
          status: "counted",
        })
        .eq("id", line.id);
    }

    await client.rpc("submit_count_session_for_review", { p_session_id: session.id });
    expect((lines ?? []).length).toBeGreaterThan(0);
    const firstLineId = (lines ?? [])[0]!.id;
    await client.rpc("review_count_line", {
      p_line_id: firstLineId,
      p_decision: "accepted",
    });

    const returned = await client.rpc("return_count_session_for_correction", {
      p_session_id: session.id,
    });
    expect(returned.error).toBeNull();
    expect(returned.data?.status).toBe("in_progress");

    const { data: lineAfter } = await admin
      .from("count_lines")
      .select("status, reviewed_by")
      .eq("id", firstLineId)
      .single();
    expect(lineAfter?.status).toBe("counted");
    expect(lineAfter?.reviewed_by).toBeNull();
  });
});
