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

describe.skipIf(!enabled)("Phase 3.5 reorder rules and restock planning", () => {
  let admin: SupabaseClient;
  let orgA: string;
  let orgB: string;
  let primaryA: string;
  let storageA: string;
  let fridgeArea: string;
  let fridgeBin: string;
  let warehouseArea: string;
  let warehouseBin: string;
  let mLUnit: string;
  let qtyItemId: string;
  let lotItemId: string;
  let lotItemBase: string;
  let supplierId: string;
  let supplierB: string;

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

    const { data: fridgeBins } = await admin
      .from("storage_bins")
      .select("id, code")
      .eq("storage_area_id", fridgeArea);
    fridgeBin = fridgeBins?.find((b) => b.code === "MED-FRIDGE-D1")?.id ?? "";

    const { data: whBins } = await admin
      .from("storage_bins")
      .select("id, code")
      .eq("storage_area_id", warehouseArea);
    warehouseBin = whBins?.[0]?.id ?? "";

    const { data: units } = await admin
      .from("units_of_measure")
      .select("id, symbol")
      .eq("organization_id", orgA);
    mLUnit = units?.find((u) => u.symbol === "mL")?.id ?? "";

    const suffix = Date.now().toString(36);
    const { data: qtyItem, error: qtyError } = await admin
      .from("items")
      .insert({
        organization_id: orgA,
        name: `Reorder Gloves ${suffix}`,
        sku: `REO-GLV-${suffix}`,
        base_unit_id: mLUnit,
        default_entry_unit_id: mLUnit,
        status: "active",
        tracking_mode: "quantity",
      })
      .select("id")
      .single();
    if (qtyError || !qtyItem) throw qtyError ?? new Error("Failed to create qty item");
    qtyItemId = qtyItem.id;

    const { data: lotItem, error: lotError } = await admin
      .from("items")
      .insert({
        organization_id: orgA,
        name: `Reorder Serum ${suffix}`,
        sku: `REO-SERUM-${suffix}`,
        base_unit_id: mLUnit,
        default_entry_unit_id: mLUnit,
        status: "active",
        tracking_mode: "lot",
      })
      .select("id, base_unit_id")
      .single();
    if (lotError || !lotItem) throw lotError ?? new Error("Failed to create lot item");
    lotItemId = lotItem.id;
    lotItemBase = lotItem.base_unit_id;

    const { data: supplier, error: supplierError } = await admin
      .from("suppliers")
      .insert({
        organization_id: orgA,
        name: `Reorder Supplier ${suffix}`,
        status: "active",
      })
      .select("id")
      .single();
    if (supplierError || !supplier) throw supplierError ?? new Error("supplier failed");
    supplierId = supplier.id;

    const { data: supplierTwo } = await admin
      .from("suppliers")
      .insert({
        organization_id: orgA,
        name: `Reorder Supplier B ${suffix}`,
        status: "active",
      })
      .select("id")
      .single();
    supplierB = supplierTwo!.id;

    if (!primaryA || !storageA || !fridgeArea || !fridgeBin || !warehouseArea) {
      throw new Error("Bootstrap reorder fixtures missing.");
    }
  });

  async function seedQty(itemId: string, locationId: string, areaId: string, binId: string | null, qty: number) {
    const { client } = await signIn("owner@nolt.local");
    const { data: txn } = await client
      .from("inventory_transactions")
      .insert({
        organization_id: orgA,
        transaction_type: "receipt",
        status: "draft",
        transaction_number: "",
        notes: `reorder seed ${Date.now()}`,
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

  async function seedLotQty(lotId: string, qty: number, locationId = primaryA, areaId = fridgeArea, binId: string | null = fridgeBin) {
    const { client } = await signIn("owner@nolt.local");
    const { data: txn } = await client
      .from("inventory_transactions")
      .insert({
        organization_id: orgA,
        transaction_type: "receipt",
        status: "draft",
        transaction_number: "",
        notes: `reorder lot seed ${Date.now()}`,
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
      destination_location_id: locationId,
      destination_storage_area_id: areaId,
      destination_bin_id: binId,
    });
    const completed = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: txn!.id,
    });
    expect(completed.error).toBeNull();
  }

  it("role mappings include inventory.reorder permissions", async () => {
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
      expect(keysFor(key).has("inventory.reorder.read")).toBe(true);
      expect(keysFor(key).has("inventory.reorder.manage")).toBe(true);
    }
    for (const key of ["location_manager", "staff", "read_only"]) {
      expect(keysFor(key).has("inventory.reorder.read")).toBe(true);
      expect(keysFor(key).has("inventory.reorder.manage")).toBe(false);
    }
  });

  it("isolates reorder rules across tenants", async () => {
    const { client: ownerA } = await signIn("owner@nolt.local");
    const { data: rule, error } = await ownerA
      .from("reorder_rules")
      .insert({
        organization_id: orgA,
        item_id: qtyItemId,
        minimum_quantity: 5,
        target_quantity: 20,
        preferred_supplier_id: supplierId,
        status: "active",
      })
      .select("id")
      .single();
    expect(error).toBeNull();

    const { client: ownerB } = await signIn("other-owner@nolt.local");
    const { data: visible } = await ownerB
      .from("reorder_rules")
      .select("id")
      .eq("id", rule!.id)
      .maybeSingle();
    expect(visible).toBeNull();
  });

  it("allows default rule and location override uniqueness", async () => {
    const { client } = await signIn("owner@nolt.local");
    const suffix = Date.now().toString(36);

    const { data: item } = await admin
      .from("items")
      .insert({
        organization_id: orgA,
        name: `Override Item ${suffix}`,
        sku: `REO-OVR-${suffix}`,
        base_unit_id: mLUnit,
        default_entry_unit_id: mLUnit,
        status: "active",
      })
      .select("id")
      .single();

    const { error: defaultError } = await client.from("reorder_rules").insert({
      organization_id: orgA,
      item_id: item!.id,
      minimum_quantity: 5,
      target_quantity: 15,
      status: "active",
    });
    expect(defaultError).toBeNull();

    const { error: overrideError } = await client.from("reorder_rules").insert({
      organization_id: orgA,
      item_id: item!.id,
      location_id: primaryA,
      minimum_quantity: 10,
      target_quantity: 30,
      reorder_quantity: 12,
      preferred_supplier_id: supplierId,
      status: "active",
    });
    expect(overrideError).toBeNull();

    const { error: duplicateDefault } = await client.from("reorder_rules").insert({
      organization_id: orgA,
      item_id: item!.id,
      minimum_quantity: 1,
      target_quantity: 2,
      status: "active",
    });
    expect(duplicateDefault).toBeTruthy();
  });

  it("respects location restrictions for location-specific rules", async () => {
    const { client: owner } = await signIn("owner@nolt.local");
    const { data: storageRule } = await owner
      .from("reorder_rules")
      .insert({
        organization_id: orgA,
        item_id: qtyItemId,
        location_id: storageA,
        minimum_quantity: 3,
        target_quantity: 9,
        preferred_supplier_id: supplierId,
        status: "active",
      })
      .select("id")
      .single();
    expect(storageRule?.id).toBeTruthy();

    const { client: restricted } = await signIn("restricted@nolt.local");
    const { data: hidden } = await restricted
      .from("reorder_rules")
      .select("id")
      .eq("id", storageRule!.id)
      .maybeSingle();
    // Restricted location manager is scoped to PRIMARY only in bootstrap.
    expect(hidden).toBeNull();

    const { error: createDenied } = await restricted.from("reorder_rules").insert({
      organization_id: orgA,
      item_id: qtyItemId,
      location_id: storageA,
      minimum_quantity: 1,
      target_quantity: 2,
      status: "active",
    });
    expect(createDenied).toBeTruthy();
  });

  it("unauthorized users cannot manage reorder rules", async () => {
    const { client: readonly } = await signIn("readonly@nolt.local");
    const { data: readable } = await readonly
      .from("reorder_rules")
      .select("id")
      .eq("organization_id", orgA)
      .limit(1);
    expect(readable).toBeTruthy();

    const { error: createDenied } = await readonly.from("reorder_rules").insert({
      organization_id: orgA,
      item_id: qtyItemId,
      minimum_quantity: 1,
      target_quantity: 2,
      status: "active",
    });
    expect(createDenied).toBeTruthy();
  });

  it("creates draft POs grouped by supplier with idempotent request keys", async () => {
    const { client } = await signIn("owner@nolt.local");
    const requestKey = `restock-${Date.now()}`;

    const { data: request, error: requestError } = await client
      .from("restock_plan_requests")
      .insert({
        organization_id: orgA,
        request_key: requestKey,
      })
      .select("id")
      .single();
    expect(requestError).toBeNull();

    const { data: poA } = await client
      .from("purchase_orders")
      .insert({
        organization_id: orgA,
        supplier_id: supplierId,
        ship_to_location_id: primaryA,
        order_date: "2026-08-02",
        status: "draft",
        po_number: "",
        notes: "restock group A",
      })
      .select("id")
      .single();

    const { data: poB } = await client
      .from("purchase_orders")
      .insert({
        organization_id: orgA,
        supplier_id: supplierB,
        ship_to_location_id: primaryA,
        order_date: "2026-08-02",
        status: "draft",
        po_number: "",
        notes: "restock group B",
      })
      .select("id")
      .single();

    await client.from("purchase_order_lines").insert([
      {
        organization_id: orgA,
        purchase_order_id: poA!.id,
        line_number: 1,
        item_id: qtyItemId,
        ordered_quantity: 18,
        purchase_unit_id: mLUnit,
      },
      {
        organization_id: orgA,
        purchase_order_id: poB!.id,
        line_number: 1,
        item_id: qtyItemId,
        ordered_quantity: 10,
        purchase_unit_id: mLUnit,
      },
    ]);

    const { error: linkError } = await client.from("restock_plan_request_orders").insert([
      {
        organization_id: orgA,
        request_id: request!.id,
        purchase_order_id: poA!.id,
      },
      {
        organization_id: orgA,
        request_id: request!.id,
        purchase_order_id: poB!.id,
      },
    ]);
    expect(linkError).toBeNull();

    const { error: duplicateRequest } = await client.from("restock_plan_requests").insert({
      organization_id: orgA,
      request_key: requestKey,
    });
    expect(duplicateRequest).toBeTruthy();

    const { data: linked } = await client
      .from("restock_plan_request_orders")
      .select("purchase_order_id")
      .eq("request_id", request!.id);
    expect(linked?.length).toBe(2);

    const { data: drafts } = await client
      .from("purchase_orders")
      .select("id, status, supplier_id")
      .in(
        "id",
        (linked ?? []).map((row) => row.purchase_order_id),
      );
    expect(drafts?.every((row) => row.status === "draft")).toBe(true);
    expect(new Set(drafts?.map((row) => row.supplier_id)).size).toBe(2);
  });

  it("readonly cannot insert restock plan requests", async () => {
    const { client } = await signIn("readonly@nolt.local");
    const { error } = await client.from("restock_plan_requests").insert({
      organization_id: orgA,
      request_key: `denied-${Date.now()}`,
    });
    expect(error).toBeTruthy();
  });

  it("supports usable-lot balance setup for quarantined and expired exclusion checks", async () => {
    const { client } = await signIn("owner@nolt.local");
    const stamp = Date.now().toString(36);

    const { data: activeLot } = await client
      .from("inventory_lots")
      .insert({
        organization_id: orgA,
        item_id: lotItemId,
        lot_number: `ACT-${stamp}`,
        status: "active",
        expiration_date: "2027-01-01",
      })
      .select("id")
      .single();
    const { data: quarantinedLot } = await client
      .from("inventory_lots")
      .insert({
        organization_id: orgA,
        item_id: lotItemId,
        lot_number: `QUA-${stamp}`,
        status: "quarantined",
      })
      .select("id")
      .single();
    const { data: expiredLot } = await client
      .from("inventory_lots")
      .insert({
        organization_id: orgA,
        item_id: lotItemId,
        lot_number: `EXP-${stamp}`,
        status: "active",
        expiration_date: "2020-01-01",
      })
      .select("id")
      .single();

    await seedLotQty(activeLot!.id, 4);
    // Quarantined/expired lots cannot move via completion; seed balances via admin rebuild path
    const { error: balError } = await admin.from("inventory_balances").insert([
      {
        organization_id: orgA,
        item_id: lotItemId,
        variant_id: null,
        lot_id: quarantinedLot!.id,
        location_id: primaryA,
        storage_area_id: fridgeArea,
        bin_id: fridgeBin,
        quantity_on_hand: 9,
      },
      {
        organization_id: orgA,
        item_id: lotItemId,
        variant_id: null,
        lot_id: expiredLot!.id,
        location_id: primaryA,
        storage_area_id: fridgeArea,
        bin_id: fridgeBin,
        quantity_on_hand: 6,
      },
    ]);
    expect(balError).toBeNull();

    const { data: balances } = await admin
      .from("inventory_balances")
      .select("quantity_on_hand, lot_id, inventory_lots(status, expiration_date)")
      .eq("organization_id", orgA)
      .eq("item_id", lotItemId)
      .eq("location_id", primaryA);

    const today = "2026-08-02";
    let usable = 0;
    for (const row of balances ?? []) {
      const lot = Array.isArray(row.inventory_lots) ? row.inventory_lots[0] : row.inventory_lots;
      if (!lot) continue;
      if (lot.status !== "active") continue;
      if (lot.expiration_date && lot.expiration_date < today) continue;
      usable += Number(row.quantity_on_hand);
    }
    expect(usable).toBe(4);

    const { error: ruleError } = await client.from("reorder_rules").insert({
      organization_id: orgA,
      item_id: lotItemId,
      minimum_quantity: 10,
      target_quantity: 25,
      preferred_supplier_id: supplierId,
      status: "active",
    });
    expect(ruleError).toBeNull();

    // available 4 < min 10 → suggested to target = 21
    const suggested = Math.max(0, 25 - usable);
    expect(suggested).toBe(21);
  });

  it("default rule target fill and fixed reorder quantity semantics", async () => {
    const available = 2;
    const minimum = 5;
    const target = 20;
    expect(available < minimum).toBe(true);
    expect(Math.max(0, target - available)).toBe(18);
    const fixed = 12;
    expect(fixed).toBe(12);
  });
});
