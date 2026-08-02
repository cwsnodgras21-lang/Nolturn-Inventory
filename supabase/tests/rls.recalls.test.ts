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

describe.skipIf(!enabled)("Phase 3.4 recall management RLS and workflow", () => {
  let admin: SupabaseClient;
  let orgA: string;
  let orgB: string;
  let primaryA: string;
  let storageA: string;
  let fridgeArea: string;
  let fridgeBin: string;
  let warehouseArea: string;
  let mLUnit: string;
  let lotItemId: string;
  let lotItemBase: string;

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

    const suffix = Date.now().toString(36);
    const { data: lotItem, error: itemError } = await admin
      .from("items")
      .insert({
        organization_id: orgA,
        name: `Recall Serum ${suffix}`,
        sku: `RCL-SERUM-${suffix}`,
        base_unit_id: mLUnit,
        default_entry_unit_id: mLUnit,
        status: "active",
        tracking_mode: "lot",
      })
      .select("id, base_unit_id")
      .single();
    if (itemError || !lotItem) throw itemError ?? new Error("Failed to create recall item");
    lotItemId = lotItem.id;
    lotItemBase = lotItem.base_unit_id;

    if (!primaryA || !storageA || !fridgeArea || !fridgeBin || !warehouseArea) {
      throw new Error("Bootstrap recall fixtures missing.");
    }
  });

  async function createLot(client: SupabaseClient, lotNumber: string) {
    return client
      .from("inventory_lots")
      .insert({
        organization_id: orgA,
        item_id: lotItemId,
        lot_number: lotNumber,
        status: "active",
      })
      .select("id, status")
      .single();
  }

  async function createRecall(client: SupabaseClient, recallNumber: string) {
    return client
      .from("inventory_recalls")
      .insert({
        organization_id: orgA,
        title: `Recall ${recallNumber}`,
        recall_number: recallNumber,
        source: "manufacturer",
        severity: "high",
        status: "draft",
      })
      .select("id, status, recall_number")
      .single();
  }

  async function seedLotQty(client: SupabaseClient, lotId: string, qty: number) {
    const { data: txn } = await client
      .from("inventory_transactions")
      .insert({
        organization_id: orgA,
        transaction_type: "receipt",
        status: "draft",
        transaction_number: "",
        notes: `recall seed ${Date.now()}`,
      })
      .select("id")
      .single();
    await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: txn!.id,
      line_number: 1,
      item_id: lotItemId,
      lot_id: lotId,
      entered_quantity: qty,
      entered_unit_id: lotItemBase,
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

  it("role mappings include inventory.recalls permissions", async () => {
    const { data: roles } = await admin
      .from("roles")
      .select("key, role_permissions(permissions(key))")
      .eq("organization_id", orgA)
      .in("key", [
        "organization_owner",
        "organization_administrator",
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
      "organization_administrator",
      "inventory_manager",
      "purchasing_manager",
    ]) {
      expect(keysFor(key).has("inventory.recalls.read")).toBe(true);
      expect(keysFor(key).has("inventory.recalls.manage")).toBe(true);
    }
    for (const key of ["location_manager", "staff", "read_only"]) {
      expect(keysFor(key).has("inventory.recalls.read")).toBe(true);
    }
  });

  it("isolates recalls across tenants", async () => {
    const { client: ownerA } = await signIn("owner@nolt.local");
    const { data: recall, error } = await createRecall(ownerA, `ISO-${Date.now()}`);
    expect(error).toBeNull();

    const { client: ownerB } = await signIn("other-owner@nolt.local");
    const { data: visible } = await ownerB
      .from("inventory_recalls")
      .select("id")
      .eq("id", recall!.id)
      .maybeSingle();
    expect(visible).toBeNull();
  });

  it("requires same-org lots and blocks duplicate attachment", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data: recall } = await createRecall(client, `DUP-${Date.now()}`);
    const { data: lot } = await createLot(client, `LOT-DUP-${Date.now()}`);

    const { error: first } = await client.from("inventory_recall_lots").insert({
      organization_id: orgA,
      recall_id: recall!.id,
      lot_id: lot!.id,
    });
    expect(first).toBeNull();

    const { error: duplicate } = await client.from("inventory_recall_lots").insert({
      organization_id: orgA,
      recall_id: recall!.id,
      lot_id: lot!.id,
    });
    expect(duplicate).toBeTruthy();

    const { data: orgBUnit } = await admin
      .from("units_of_measure")
      .select("id")
      .eq("organization_id", orgB)
      .limit(1)
      .maybeSingle();
    expect(orgBUnit?.id).toBeTruthy();

    const { data: orgBItem } = await admin
      .from("items")
      .insert({
        organization_id: orgB,
        name: `Foreign Lot Item ${Date.now()}`,
        sku: `FOREIGN-LOT-${Date.now()}`,
        base_unit_id: orgBUnit!.id,
        default_entry_unit_id: orgBUnit!.id,
        status: "active",
        tracking_mode: "lot",
      })
      .select("id")
      .single();

    const { data: foreignLot } = await admin
      .from("inventory_lots")
      .insert({
        organization_id: orgB,
        item_id: orgBItem!.id,
        lot_number: `FOREIGN-${Date.now()}`,
        status: "active",
      })
      .select("id")
      .single();

    const { error: cross } = await client.from("inventory_recall_lots").insert({
      organization_id: orgA,
      recall_id: recall!.id,
      lot_id: foreignLot!.id,
    });
    expect(cross?.message ?? "").toMatch(/same organization/i);
  });

  it("quarantining through a recall blocks future movement and preserves ledger history", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data: lot } = await createLot(client, `LOT-Q-${Date.now()}`);
    await seedLotQty(client, lot!.id, 15);

    const { data: beforeLedger } = await admin
      .from("inventory_ledger_entries")
      .select("id, quantity_delta, lot_id")
      .eq("lot_id", lot!.id);
    const beforeCount = beforeLedger?.length ?? 0;
    const beforeSum = (beforeLedger ?? []).reduce((acc, row) => acc + Number(row.quantity_delta), 0);

    const { data: recall } = await createRecall(client, `Q-${Date.now()}`);
    await client.from("inventory_recall_lots").insert({
      organization_id: orgA,
      recall_id: recall!.id,
      lot_id: lot!.id,
    });

    const { data: quarantinedCount, error: qError } = await client.rpc("quarantine_recall_lots", {
      p_recall_id: recall!.id,
    });
    expect(qError).toBeNull();
    expect(Number(quarantinedCount)).toBe(1);

    const { data: lotAfter } = await admin
      .from("inventory_lots")
      .select("status")
      .eq("id", lot!.id)
      .single();
    expect(lotAfter?.status).toBe("quarantined");

    const { data: consume } = await client
      .from("inventory_transactions")
      .insert({
        organization_id: orgA,
        transaction_type: "consumption",
        status: "draft",
        transaction_number: "",
        notes: "should fail quarantine",
      })
      .select("id")
      .single();
    const { error: lineError } = await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: consume!.id,
      line_number: 1,
      item_id: lotItemId,
      lot_id: lot!.id,
      entered_quantity: 1,
      entered_unit_id: lotItemBase,
      conversion_multiplier: 1,
      base_quantity: 1,
      source_location_id: primaryA,
      source_storage_area_id: fridgeArea,
      source_bin_id: fridgeBin,
    });
    expect(lineError?.message ?? "").toMatch(/lot is not available/i);

    const { data: afterLedger } = await admin
      .from("inventory_ledger_entries")
      .select("id, quantity_delta")
      .eq("lot_id", lot!.id);
    expect(afterLedger?.length).toBe(beforeCount);
    const afterSum = (afterLedger ?? []).reduce((acc, row) => acc + Number(row.quantity_delta), 0);
    expect(afterSum).toBe(beforeSum);
  });

  it("calculates affected quantities and respects resolve without releasing quarantine", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data: lot } = await createLot(client, `LOT-QTY-${Date.now()}`);
    await seedLotQty(client, lot!.id, 8);

    // transfer some to warehouse so affected stock has two locations
    const { data: transfer } = await client
      .from("inventory_transactions")
      .insert({
        organization_id: orgA,
        transaction_type: "transfer",
        status: "draft",
        transaction_number: "",
        notes: "recall qty split",
      })
      .select("id")
      .single();
    await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: transfer!.id,
      line_number: 1,
      item_id: lotItemId,
      lot_id: lot!.id,
      entered_quantity: 3,
      entered_unit_id: lotItemBase,
      conversion_multiplier: 1,
      base_quantity: 3,
      source_location_id: primaryA,
      source_storage_area_id: fridgeArea,
      source_bin_id: fridgeBin,
      destination_location_id: storageA,
      destination_storage_area_id: warehouseArea,
      destination_bin_id: null,
    });
    expect(
      (await client.rpc("complete_inventory_transaction", { p_transaction_id: transfer!.id })).error,
    ).toBeNull();

    const { data: recall } = await createRecall(client, `QTY-${Date.now()}`);
    await client.from("inventory_recall_lots").insert({
      organization_id: orgA,
      recall_id: recall!.id,
      lot_id: lot!.id,
    });

    const { data: balances } = await admin
      .from("inventory_balances")
      .select("location_id, quantity_on_hand")
      .eq("lot_id", lot!.id)
      .gt("quantity_on_hand", 0);
    const total = (balances ?? []).reduce((acc, row) => acc + Number(row.quantity_on_hand), 0);
    expect(total).toBe(8);
    expect((balances ?? []).length).toBeGreaterThanOrEqual(2);

    await client.rpc("quarantine_recall_lots", { p_recall_id: recall!.id });
    expect(
      (
        await client
          .from("inventory_recalls")
          .update({ status: "active" })
          .eq("id", recall!.id)
      ).error,
    ).toBeNull();
    expect(
      (
        await client
          .from("inventory_recalls")
          .update({ status: "resolved" })
          .eq("id", recall!.id)
      ).error,
    ).toBeNull();

    const { data: lotAfter } = await admin
      .from("inventory_lots")
      .select("status")
      .eq("id", lot!.id)
      .single();
    expect(lotAfter?.status).toBe("quarantined");

    const { data: recallAfter } = await admin
      .from("inventory_recalls")
      .select("status, closed_at")
      .eq("id", recall!.id)
      .single();
    expect(recallAfter?.status).toBe("resolved");
    expect(recallAfter?.closed_at).toBeTruthy();
  });

  it("unauthorized users cannot manage recalls", async () => {
    const { client: owner } = await signIn("owner@nolt.local");
    const { data: recall } = await createRecall(owner, `RO-${Date.now()}`);

    const { client: readonly } = await signIn("readonly@nolt.local");
    const { data: visible } = await readonly
      .from("inventory_recalls")
      .select("id")
      .eq("id", recall!.id)
      .maybeSingle();
    expect(visible?.id).toBe(recall!.id);

    const { data: updated } = await readonly
      .from("inventory_recalls")
      .update({ notes: "nope" })
      .eq("id", recall!.id)
      .select("id");
    expect(updated ?? []).toHaveLength(0);

    const { error: createDenied } = await readonly.from("inventory_recalls").insert({
      organization_id: orgA,
      title: "Denied",
      recall_number: `DENY-${Date.now()}`,
      source: "internal",
      status: "draft",
    });
    expect(createDenied).toBeTruthy();

    const { error: quarantineDenied } = await readonly.rpc("quarantine_recall_lots", {
      p_recall_id: recall!.id,
    });
    expect(quarantineDenied).toBeTruthy();
  });
});
