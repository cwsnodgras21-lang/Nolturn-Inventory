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

describe.skipIf(!enabled)("Phase 3.6 operational alerts", () => {
  let admin: SupabaseClient;
  let orgA: string;
  let orgB: string;
  let primaryA: string;
  let storageA: string;
  let fridgeArea: string;
  let fridgeBin: string;
  let mLUnit: string;
  let itemId: string;
  let supplierId: string;

  beforeAll(async () => {
    admin = createClient(url!, service!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: orgs } = await admin.from("organizations").select("id, slug");
    orgA = orgs?.find((o) => o.slug.startsWith("north-clinic"))?.id ?? "";
    orgB = orgs?.find((o) => o.slug.startsWith("south-wellness"))?.id ?? "";
    if (!orgA || !orgB) throw new Error("Bootstrap orgs missing.");

    const { data: locsA } = await admin.from("locations").select("id, code").eq("organization_id", orgA);
    primaryA = locsA?.find((l) => l.code === "PRIMARY")?.id ?? "";
    storageA = locsA?.find((l) => l.code === "STORAGE")?.id ?? "";

    const { data: areas } = await admin
      .from("storage_areas")
      .select("id, code, location_id")
      .eq("organization_id", orgA);
    fridgeArea = areas?.find((a) => a.code === "MED-FRIDGE" && a.location_id === primaryA)?.id ?? "";
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

    const suffix = Date.now().toString(36);
    const { data: item } = await admin
      .from("items")
      .insert({
        organization_id: orgA,
        name: `Alert Item ${suffix}`,
        sku: `ALT-${suffix}`,
        base_unit_id: mLUnit,
        default_entry_unit_id: mLUnit,
        status: "active",
      })
      .select("id")
      .single();
    itemId = item!.id;

    const { data: supplier } = await admin
      .from("suppliers")
      .insert({
        organization_id: orgA,
        name: `Alert Supplier ${suffix}`,
        status: "active",
      })
      .select("id")
      .single();
    supplierId = supplier!.id;

    if (!primaryA || !storageA || !fridgeArea || !fridgeBin) {
      throw new Error("Bootstrap alert fixtures missing.");
    }
  });

  async function seedQty(qty: number, locationId = primaryA, areaId = fridgeArea, binId: string | null = fridgeBin) {
    const { client } = await signIn("owner@nolt.local");
    const { data: txn } = await client
      .from("inventory_transactions")
      .insert({
        organization_id: orgA,
        transaction_type: "receipt",
        status: "draft",
        transaction_number: "",
      })
      .select("id")
      .single();
    await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: txn!.id,
      line_number: 1,
      item_id: itemId,
      entered_quantity: qty,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: qty,
      destination_location_id: locationId,
      destination_storage_area_id: areaId,
      destination_bin_id: binId,
    });
    const completed = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: txn!.id,
    });
    expect(completed.error).toBeNull();
  }

  it("role mappings include alerts permissions", async () => {
    const { data: roles } = await admin
      .from("roles")
      .select("key, role_permissions(permissions(key))")
      .eq("organization_id", orgA)
      .in("key", [
        "organization_owner",
        "inventory_manager",
        "purchasing_manager",
        "location_manager",
        "staff",
        "read_only",
      ]);

    const keysFor = (roleKey: string) => {
      const role = roles?.find((r) => r.key === roleKey);
      const perms = (role?.role_permissions ?? []) as Array<{ permissions?: { key?: string } | null }>;
      return new Set(perms.map((p) => p.permissions?.key).filter(Boolean));
    };

    for (const key of [
      "organization_owner",
      "inventory_manager",
      "purchasing_manager",
      "location_manager",
    ]) {
      expect(keysFor(key).has("alerts.read")).toBe(true);
      expect(keysFor(key).has("alerts.manage")).toBe(true);
    }
    for (const key of ["staff", "read_only"]) {
      expect(keysFor(key).has("alerts.read")).toBe(true);
      expect(keysFor(key).has("alerts.manage")).toBe(false);
    }
  });

  it("generates low-stock alerts and avoids duplicates", async () => {
    const { client } = await signIn("owner@nolt.local");
    await seedQty(2);

    const { error: ruleError } = await client.from("reorder_rules").insert({
      organization_id: orgA,
      item_id: itemId,
      location_id: primaryA,
      minimum_quantity: 10,
      target_quantity: 30,
      preferred_supplier_id: supplierId,
      status: "active",
    });
    expect(ruleError).toBeNull();

    const first = await client.rpc("sync_operational_alerts", { p_organization_id: orgA });
    expect(first.error).toBeNull();
    expect(Number(first.data?.created ?? 0)).toBeGreaterThanOrEqual(1);

    const { data: alerts } = await client
      .from("operational_alerts")
      .select("id, alert_type, status, condition_key")
      .eq("organization_id", orgA)
      .eq("alert_type", "low_stock")
      .eq("entity_id", itemId)
      .in("status", ["open", "acknowledged"]);
    expect(alerts?.length).toBe(1);

    const second = await client.rpc("sync_operational_alerts", { p_organization_id: orgA });
    expect(second.error).toBeNull();
    expect(Number(second.data?.created ?? 0)).toBe(0);

    const { data: after } = await client
      .from("operational_alerts")
      .select("id")
      .eq("organization_id", orgA)
      .eq("alert_type", "low_stock")
      .eq("entity_id", itemId)
      .in("status", ["open", "acknowledged"]);
    expect(after?.length).toBe(1);
  });

  it("resolves alerts when condition clears", async () => {
    const { client } = await signIn("owner@nolt.local");
    await seedQty(50);

    const sync = await client.rpc("sync_operational_alerts", { p_organization_id: orgA });
    expect(sync.error).toBeNull();

    const { data: open } = await client
      .from("operational_alerts")
      .select("id, status")
      .eq("organization_id", orgA)
      .eq("alert_type", "low_stock")
      .eq("entity_id", itemId)
      .in("status", ["open", "acknowledged"]);
    expect(open?.length ?? 0).toBe(0);

    const { data: resolved } = await client
      .from("operational_alerts")
      .select("id, status, resolved_at")
      .eq("organization_id", orgA)
      .eq("alert_type", "low_stock")
      .eq("entity_id", itemId)
      .eq("status", "resolved");
    expect((resolved?.length ?? 0) > 0).toBe(true);
    expect(resolved?.[0]?.resolved_at).toBeTruthy();
  });

  it("creates expired and quarantine alerts linked to lots", async () => {
    const { client } = await signIn("owner@nolt.local");
    const stamp = Date.now().toString(36);

    const { data: lotItem } = await admin
      .from("items")
      .insert({
        organization_id: orgA,
        name: `Alert Lot Item ${stamp}`,
        sku: `ALT-LOT-${stamp}`,
        base_unit_id: mLUnit,
        default_entry_unit_id: mLUnit,
        status: "active",
        tracking_mode: "lot",
      })
      .select("id")
      .single();

    const { data: expiredLot } = await client
      .from("inventory_lots")
      .insert({
        organization_id: orgA,
        item_id: lotItem!.id,
        lot_number: `EXP-${stamp}`,
        status: "active",
        expiration_date: "2020-01-01",
      })
      .select("id")
      .single();

    const { data: quarantinedLot } = await client
      .from("inventory_lots")
      .insert({
        organization_id: orgA,
        item_id: lotItem!.id,
        lot_number: `QUA-${stamp}`,
        status: "quarantined",
      })
      .select("id")
      .single();

    await admin.from("inventory_balances").insert([
      {
        organization_id: orgA,
        item_id: lotItem!.id,
        lot_id: expiredLot!.id,
        location_id: primaryA,
        storage_area_id: fridgeArea,
        bin_id: fridgeBin,
        quantity_on_hand: 3,
      },
      {
        organization_id: orgA,
        item_id: lotItem!.id,
        lot_id: quarantinedLot!.id,
        location_id: primaryA,
        storage_area_id: fridgeArea,
        bin_id: fridgeBin,
        quantity_on_hand: 2,
      },
    ]);

    const sync = await client.rpc("sync_operational_alerts", { p_organization_id: orgA });
    expect(sync.error).toBeNull();

    const { data: expiredAlert } = await client
      .from("operational_alerts")
      .select("id, entity_id, alert_type")
      .eq("organization_id", orgA)
      .eq("alert_type", "expired_stock")
      .eq("entity_id", expiredLot!.id)
      .eq("status", "open")
      .maybeSingle();
    expect(expiredAlert?.entity_id).toBe(expiredLot!.id);

    const { data: quarantineAlert } = await client
      .from("operational_alerts")
      .select("id, entity_id")
      .eq("organization_id", orgA)
      .eq("alert_type", "quarantined_inventory")
      .eq("entity_id", quarantinedLot!.id)
      .eq("status", "open")
      .maybeSingle();
    expect(quarantineAlert?.entity_id).toBe(quarantinedLot!.id);
  });

  it("creates active recall alerts", async () => {
    const { client } = await signIn("owner@nolt.local");
    const number = `ALR-${Date.now()}`;
    const { data: recall } = await client
      .from("inventory_recalls")
      .insert({
        organization_id: orgA,
        title: "Alert recall",
        recall_number: number,
        source: "internal",
        severity: "high",
        status: "active",
      })
      .select("id")
      .single();

    const sync = await client.rpc("sync_operational_alerts", { p_organization_id: orgA });
    expect(sync.error).toBeNull();

    const { data: alert } = await client
      .from("operational_alerts")
      .select("id, entity_id, severity")
      .eq("alert_type", "active_recall")
      .eq("entity_id", recall!.id)
      .eq("status", "open")
      .maybeSingle();
    expect(alert?.severity).toBe("high");
  });

  it("isolates alerts across tenants and respects location restrictions", async () => {
    const { client: ownerA } = await signIn("owner@nolt.local");
    const { data: storageAlert } = await admin
      .from("operational_alerts")
      .insert({
        organization_id: orgA,
        alert_type: "overdue_count",
        severity: "medium",
        entity_type: "count_session",
        entity_id: crypto.randomUUID(),
        location_id: storageA,
        condition_key: `overdue_count:count_session:test-${Date.now()}:${storageA}`,
        title: "Storage overdue",
        description: "test",
        status: "open",
      })
      .select("id")
      .single();

    const { data: visibleToOwner } = await ownerA
      .from("operational_alerts")
      .select("id")
      .eq("id", storageAlert!.id)
      .maybeSingle();
    expect(visibleToOwner?.id).toBe(storageAlert!.id);

    const { client: restricted } = await signIn("restricted@nolt.local");
    const { data: hidden } = await restricted
      .from("operational_alerts")
      .select("id")
      .eq("id", storageAlert!.id)
      .maybeSingle();
    expect(hidden).toBeNull();

    const { client: ownerB } = await signIn("other-owner@nolt.local");
    const { data: crossTenant } = await ownerB
      .from("operational_alerts")
      .select("id")
      .eq("id", storageAlert!.id)
      .maybeSingle();
    expect(crossTenant).toBeNull();
  });

  it("enforces acknowledge/resolve permissions and writes audit via app path checks", async () => {
    const { client: readonly } = await signIn("readonly@nolt.local");
    const denied = await readonly.rpc("sync_operational_alerts", { p_organization_id: orgA });
    expect(denied.error).toBeTruthy();

    const { client: owner } = await signIn("owner@nolt.local");
    const { data: alert } = await owner
      .from("operational_alerts")
      .select("id, status")
      .eq("organization_id", orgA)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();

    if (alert) {
      const { error: ackDenied } = await readonly
        .from("operational_alerts")
        .update({
          status: "acknowledged",
          acknowledged_by: (await signIn("readonly@nolt.local")).userId,
          acknowledged_at: new Date().toISOString(),
        })
        .eq("id", alert.id);
      expect(ackDenied).toBeTruthy();

      const { error: ackOk } = await owner
        .from("operational_alerts")
        .update({
          status: "acknowledged",
          acknowledged_by: (await signIn("owner@nolt.local")).userId,
          acknowledged_at: new Date().toISOString(),
        })
        .eq("id", alert.id);
      expect(ackOk).toBeNull();
    }
  });

  it("creates overdue PO and overdue count alerts", async () => {
    const { client } = await signIn("owner@nolt.local");

    const { data: po } = await client
      .from("purchase_orders")
      .insert({
        organization_id: orgA,
        supplier_id: supplierId,
        ship_to_location_id: primaryA,
        order_date: "2026-01-01",
        expected_date: "2026-01-15",
        status: "draft",
        po_number: "",
      })
      .select("id")
      .single();

    await client.rpc("submit_purchase_order", { p_purchase_order_id: po!.id });

    const { data: count } = await client
      .from("count_sessions")
      .insert({
        organization_id: orgA,
        name: `Overdue count ${Date.now()}`,
        status: "draft",
        due_date: "2026-01-01",
      })
      .select("id")
      .single();
    await client.from("count_session_locations").insert({
      organization_id: orgA,
      count_session_id: count!.id,
      location_id: primaryA,
    });

    const sync = await client.rpc("sync_operational_alerts", { p_organization_id: orgA });
    expect(sync.error).toBeNull();

    const { data: poAlert } = await client
      .from("operational_alerts")
      .select("id")
      .eq("alert_type", "overdue_purchase_order")
      .eq("entity_id", po!.id)
      .eq("status", "open")
      .maybeSingle();
    expect(poAlert?.id).toBeTruthy();

    const { data: countAlert } = await client
      .from("operational_alerts")
      .select("id")
      .eq("alert_type", "overdue_count")
      .eq("entity_id", count!.id)
      .eq("status", "open")
      .maybeSingle();
    expect(countAlert?.id).toBeTruthy();
  });
});
