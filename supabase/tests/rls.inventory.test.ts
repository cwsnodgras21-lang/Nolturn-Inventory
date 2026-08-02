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

type BalanceDims = {
  itemId: string;
  variantId?: string | null;
  locationId: string;
  storageAreaId: string;
  binId?: string | null;
};

describe.skipIf(!enabled)("Phase 2.5–2.6 inventory movements, reversals, and ledger hardening", () => {
  let admin: SupabaseClient;
  let orgA: string;
  let orgB: string;
  let primaryA: string;
  let storageA: string;
  let alcoholId: string;
  let alcoholBase: string;
  let alcoholEntry: string;
  let glovesId: string;
  let glovesBase: string;
  let mediumVariant: string;
  let fridgeArea: string;
  let fridgeBin: string;
  let topShelf: string;
  let warehouseArea: string;
  let mLUnit: string;
  let boxUnit: string;

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
      .select("id, sku, base_unit_id, default_entry_unit_id")
      .eq("organization_id", orgA);
    const alcohol = items?.find((i) => i.sku === "INJ-IPA-500");
    const gloves = items?.find((i) => i.sku === "PPE-GLOVE-NIT");
    alcoholId = alcohol?.id ?? "";
    alcoholBase = alcohol?.base_unit_id ?? "";
    alcoholEntry = alcohol?.default_entry_unit_id ?? "";
    glovesId = gloves?.id ?? "";
    glovesBase = gloves?.base_unit_id ?? "";

    const { data: variants } = await admin
      .from("item_variants")
      .select("id, name")
      .eq("item_id", glovesId);
    mediumVariant = variants?.find((v) => v.name === "Medium")?.id ?? "";

    const { data: areas } = await admin
      .from("storage_areas")
      .select("id, code, location_id")
      .eq("organization_id", orgA);
    fridgeArea = areas?.find((a) => a.code === "MED-FRIDGE" && a.location_id === primaryA)?.id ?? "";
    topShelf = areas?.find((a) => a.code === "SUPPLY-CAB-A-TOP" && a.location_id === primaryA)?.id ?? "";
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
    boxUnit = units?.find((u) => u.symbol === "box")?.id ?? "";

    if (
      !primaryA ||
      !storageA ||
      !alcoholId ||
      !glovesId ||
      !mediumVariant ||
      !fridgeArea ||
      !fridgeBin ||
      !topShelf ||
      !warehouseArea
    ) {
      throw new Error("Bootstrap inventory fixtures missing.");
    }
  });

  async function createDraft(
    client: SupabaseClient,
    orgId: string,
    transactionType: string,
    extras: { notes?: string; reference_text?: string } = {},
  ) {
    return client
      .from("inventory_transactions")
      .insert({
        organization_id: orgId,
        transaction_type: transactionType,
        status: "draft",
        transaction_number: "",
        notes: extras.notes ?? `test ${transactionType} ${Date.now()}`,
        reference_text: extras.reference_text ?? null,
      })
      .select("id, transaction_number, status")
      .single();
  }

  async function balanceQty(dims: BalanceDims) {
    let query = admin
      .from("inventory_balances")
      .select("quantity_on_hand")
      .eq("organization_id", orgA)
      .eq("item_id", dims.itemId)
      .eq("location_id", dims.locationId)
      .eq("storage_area_id", dims.storageAreaId);
    query = dims.variantId ? query.eq("variant_id", dims.variantId) : query.is("variant_id", null);
    query = dims.binId ? query.eq("bin_id", dims.binId) : query.is("bin_id", null);
    const { data } = await query.maybeSingle();
    return Number(data?.quantity_on_hand ?? 0);
  }

  async function orgItemTotal(itemId: string, variantId?: string | null) {
    let query = admin
      .from("inventory_balances")
      .select("quantity_on_hand")
      .eq("organization_id", orgA)
      .eq("item_id", itemId);
    query = variantId ? query.eq("variant_id", variantId) : query.is("variant_id", null);
    const { data } = await query;
    return (data ?? []).reduce((sum, row) => sum + Number(row.quantity_on_hand), 0);
  }

  async function seedStock(
    client: SupabaseClient,
    qtyBase: number,
    dims: BalanceDims & { enteredUnitId?: string },
  ) {
    const { data: txn, error } = await createDraft(client, orgA, "positive_adjustment");
    expect(error).toBeNull();
    const { error: lineError } = await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: txn!.id,
      line_number: 1,
      item_id: dims.itemId,
      variant_id: dims.variantId ?? null,
      entered_quantity: qtyBase,
      entered_unit_id: dims.enteredUnitId ?? alcoholBase,
      conversion_multiplier: 1,
      base_quantity: qtyBase,
      destination_location_id: dims.locationId,
      destination_storage_area_id: dims.storageAreaId,
      destination_bin_id: dims.binId ?? null,
    });
    expect(lineError).toBeNull();
    const { error: completeError } = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: txn!.id,
    });
    expect(completeError).toBeNull();
    return txn!.id;
  }

  it("role mappings include inventory movement permissions", async () => {
    const { data } = await admin
      .from("roles")
      .select("key, role_permissions(permissions(key))")
      .eq("organization_id", orgA)
      .in("key", [
        "inventory_manager",
        "purchasing_manager",
        "location_manager",
        "staff",
        "read_only",
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

    expect(keysFor("inventory_manager").has("inventory.adjust")).toBe(true);
    expect(keysFor("inventory_manager").has("inventory.receive")).toBe(true);
    expect(keysFor("inventory_manager").has("inventory.consume")).toBe(true);
    expect(keysFor("inventory_manager").has("inventory.transfer")).toBe(true);
    expect(keysFor("inventory_manager").has("inventory.reverse")).toBe(true);
    expect(keysFor("location_manager").has("inventory.transfer")).toBe(true);
    expect(keysFor("location_manager").has("inventory.reverse")).toBe(true);
    expect(keysFor("purchasing_manager").has("inventory.read")).toBe(true);
    expect(keysFor("purchasing_manager").has("inventory.receive")).toBe(true);
    expect(keysFor("purchasing_manager").has("inventory.adjust")).toBe(false);
    expect(keysFor("purchasing_manager").has("inventory.reverse")).toBe(false);
    expect(keysFor("staff").has("inventory.consume")).toBe(true);
    expect(keysFor("staff").has("inventory.receive")).toBe(false);
    expect(keysFor("staff").has("inventory.reverse")).toBe(false);
    expect(keysFor("read_only").has("inventory.read")).toBe(true);
    expect(keysFor("read_only").has("inventory.adjust")).toBe(false);
    expect(keysFor("read_only").has("inventory.receive")).toBe(false);
    expect(keysFor("read_only").has("inventory.reverse")).toBe(false);
  });

  it("positive adjustment increases balance with correct conversion", async () => {
    const { client } = await signIn("owner@nolt.local");
    const dims = {
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: null as string | null,
    };
    const before = await balanceQty(dims);

    const { data: txn, error } = await createDraft(client, orgA, "positive_adjustment");
    expect(error).toBeNull();

    const { error: lineError } = await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: txn!.id,
      line_number: 1,
      item_id: alcoholId,
      entered_quantity: 1,
      entered_unit_id: alcoholEntry,
      conversion_multiplier: 1,
      base_quantity: 1,
      destination_location_id: primaryA,
      destination_storage_area_id: fridgeArea,
    });
    expect(lineError).toBeNull();

    const { error: completeError } = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: txn!.id,
    });
    expect(completeError).toBeNull();

    const { data: line } = await client
      .from("inventory_transaction_lines")
      .select("conversion_multiplier, base_quantity")
      .eq("transaction_id", txn!.id)
      .single();
    expect(Number(line?.conversion_multiplier)).toBe(500);
    expect(Number(line?.base_quantity)).toBe(500);
    expect(await balanceQty(dims)).toBe(before + 500);
  });

  it("receipt increases stock at destination", async () => {
    const { client } = await signIn("owner@nolt.local");
    const dims = {
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: fridgeBin,
    };
    const before = await balanceQty(dims);

    const { data: txn, error } = await createDraft(client, orgA, "receipt", {
      reference_text: `DN-${Date.now()}`,
    });
    expect(error).toBeNull();
    expect(txn?.transaction_number).toMatch(/^RCV-/);

    const { error: lineError } = await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: txn!.id,
      line_number: 1,
      item_id: alcoholId,
      entered_quantity: 50,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 50,
      destination_location_id: primaryA,
      destination_storage_area_id: fridgeArea,
      destination_bin_id: fridgeBin,
    });
    expect(lineError).toBeNull();

    const { error: completeError } = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: txn!.id,
    });
    expect(completeError).toBeNull();
    expect(await balanceQty(dims)).toBe(before + 50);

    const { data: ledger } = await admin
      .from("inventory_ledger_entries")
      .select("quantity_delta, effect_role")
      .eq("transaction_id", txn!.id);
    expect(ledger).toHaveLength(1);
    const entry = ledger?.[0];
    expect(entry).toBeTruthy();
    expect(Number(entry?.quantity_delta)).toBe(50);
    expect(entry?.effect_role).toBe("primary");
  });

  it("consumption decreases stock at source", async () => {
    const { client } = await signIn("owner@nolt.local");
    const dims = {
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: fridgeBin,
    };
    await seedStock(client, 40, { ...dims, enteredUnitId: mLUnit });
    const before = await balanceQty(dims);

    const { data: txn, error } = await createDraft(client, orgA, "consumption");
    expect(error).toBeNull();
    expect(txn?.transaction_number).toMatch(/^CON-/);

    const { error: lineError } = await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: txn!.id,
      line_number: 1,
      item_id: alcoholId,
      entered_quantity: 15,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 15,
      source_location_id: primaryA,
      source_storage_area_id: fridgeArea,
      source_bin_id: fridgeBin,
    });
    expect(lineError).toBeNull();

    const { error: completeError } = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: txn!.id,
    });
    expect(completeError).toBeNull();
    expect(await balanceQty(dims)).toBe(before - 15);
  });

  it("negative adjustment decreases stock and requires reason", async () => {
    const { client } = await signIn("owner@nolt.local");
    const dims = {
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: fridgeBin,
    };
    await seedStock(client, 25, { ...dims, enteredUnitId: mLUnit });
    const before = await balanceQty(dims);

    const { data: noReason, error: noReasonError } = await createDraft(
      client,
      orgA,
      "negative_adjustment",
      { notes: "   " },
    );
    expect(noReasonError).toBeNull();
    await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: noReason!.id,
      line_number: 1,
      item_id: alcoholId,
      entered_quantity: 5,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 5,
      source_location_id: primaryA,
      source_storage_area_id: fridgeArea,
      source_bin_id: fridgeBin,
    });
    const blocked = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: noReason!.id,
    });
    expect(blocked.error).toBeTruthy();

    const { data: txn, error } = await createDraft(client, orgA, "negative_adjustment", {
      notes: "Damaged vial",
    });
    expect(error).toBeNull();
    expect(txn?.transaction_number).toMatch(/^NADJ-/);

    await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: txn!.id,
      line_number: 1,
      item_id: alcoholId,
      entered_quantity: 5,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 5,
      source_location_id: primaryA,
      source_storage_area_id: fridgeArea,
      source_bin_id: fridgeBin,
    });
    const { error: completeError } = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: txn!.id,
    });
    expect(completeError).toBeNull();
    expect(await balanceQty(dims)).toBe(before - 5);
  });

  it("transfer moves stock source↓ destination↑ and preserves org total", async () => {
    const { client } = await signIn("owner@nolt.local");
    const source = {
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: fridgeBin,
    };
    const dest = {
      itemId: alcoholId,
      locationId: storageA,
      storageAreaId: warehouseArea,
      binId: null as string | null,
    };
    await seedStock(client, 60, { ...source, enteredUnitId: mLUnit });
    const beforeSource = await balanceQty(source);
    const beforeDest = await balanceQty(dest);
    const beforeOrg = await orgItemTotal(alcoholId);

    const { data: txn, error } = await createDraft(client, orgA, "transfer");
    expect(error).toBeNull();
    expect(txn?.transaction_number).toMatch(/^XFR-/);

    const { error: lineError } = await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: txn!.id,
      line_number: 1,
      item_id: alcoholId,
      entered_quantity: 20,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 20,
      source_location_id: primaryA,
      source_storage_area_id: fridgeArea,
      source_bin_id: fridgeBin,
      destination_location_id: storageA,
      destination_storage_area_id: warehouseArea,
    });
    expect(lineError).toBeNull();

    const { error: completeError } = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: txn!.id,
    });
    expect(completeError).toBeNull();

    expect(await balanceQty(source)).toBe(beforeSource - 20);
    expect(await balanceQty(dest)).toBe(beforeDest + 20);
    expect(await orgItemTotal(alcoholId)).toBe(beforeOrg);

    const { data: ledger } = await admin
      .from("inventory_ledger_entries")
      .select("quantity_delta, effect_role, location_id")
      .eq("transaction_id", txn!.id)
      .order("effect_role");
    expect(ledger).toHaveLength(2);
    const sourceEntry = ledger?.find((e) => e.effect_role === "source");
    const destEntry = ledger?.find((e) => e.effect_role === "destination");
    expect(Number(sourceEntry?.quantity_delta)).toBe(-20);
    expect(sourceEntry?.location_id).toBe(primaryA);
    expect(Number(destEntry?.quantity_delta)).toBe(20);
    expect(destEntry?.location_id).toBe(storageA);
  });

  it("restricted user cannot persist unauthorized location lines in a draft", async () => {
    // Phase 2.6: draft line RLS requires location access; completion remains defense in depth.
    const restricted = await signIn("restricted@nolt.local");
    const { data: txn } = await createDraft(restricted.client, orgA, "positive_adjustment");

    const { data: line, error: lineError } = await restricted.client
      .from("inventory_transaction_lines")
      .insert({
        organization_id: orgA,
        transaction_id: txn!.id,
        line_number: 1,
        item_id: alcoholId,
        entered_quantity: 1,
        entered_unit_id: alcoholBase,
        conversion_multiplier: 1,
        base_quantity: 1,
        destination_location_id: storageA,
        destination_storage_area_id: warehouseArea,
      })
      .select("id")
      .maybeSingle();
    expect(lineError).toBeTruthy();
    expect(line).toBeNull();
    expect(lineError?.message ?? "").toMatch(/row-level security|policy|permission|accessible/i);

    const { data: persisted } = await admin
      .from("inventory_transaction_lines")
      .select("id")
      .eq("transaction_id", txn!.id);
    expect(persisted ?? []).toHaveLength(0);

    // Accessible location still works for this user.
    const { error: okLineError } = await restricted.client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: txn!.id,
      line_number: 1,
      item_id: alcoholId,
      entered_quantity: 1,
      entered_unit_id: alcoholBase,
      conversion_multiplier: 1,
      base_quantity: 1,
      destination_location_id: primaryA,
      destination_storage_area_id: fridgeArea,
    });
    expect(okLineError).toBeNull();
  });

  it("blocks cross-tenant inventory access and completion", async () => {
    const ownerB = await signIn("other-owner@nolt.local");
    const { data } = await ownerB.client
      .from("inventory_balances")
      .select("id")
      .eq("organization_id", orgA);
    expect(data ?? []).toEqual([]);

    const { client: ownerA } = await signIn("owner@nolt.local");
    const { data: txn } = await createDraft(ownerA, orgA, "receipt");
    await ownerA.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: txn!.id,
      line_number: 1,
      item_id: alcoholId,
      entered_quantity: 1,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 1,
      destination_location_id: primaryA,
      destination_storage_area_id: fridgeArea,
      destination_bin_id: fridgeBin,
    });

    const { error } = await ownerB.client.rpc("complete_inventory_transaction", {
      p_transaction_id: txn!.id,
    });
    expect(error).toBeTruthy();
  });

  it("rejects negative stock when disabled and allows when enabled", async () => {
    const { client } = await signIn("owner@nolt.local");
    const dims = {
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: fridgeBin,
    };

    await admin.from("items").update({ allow_negative_stock: false }).eq("id", alcoholId);
    const available = await balanceQty(dims);

    const { data: deniedTxn } = await createDraft(client, orgA, "consumption");
    await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: deniedTxn!.id,
      line_number: 1,
      item_id: alcoholId,
      entered_quantity: available + 100,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: available + 100,
      source_location_id: primaryA,
      source_storage_area_id: fridgeArea,
      source_bin_id: fridgeBin,
    });
    const denied = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: deniedTxn!.id,
    });
    expect(denied.error).toBeTruthy();
    expect(denied.error?.message ?? "").toMatch(/insufficient stock/i);
    expect(await balanceQty(dims)).toBe(available);

    await admin.from("items").update({ allow_negative_stock: true }).eq("id", alcoholId);
    const { data: allowedTxn } = await createDraft(client, orgA, "consumption");
    await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: allowedTxn!.id,
      line_number: 1,
      item_id: alcoholId,
      entered_quantity: available + 7,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: available + 7,
      source_location_id: primaryA,
      source_storage_area_id: fridgeArea,
      source_bin_id: fridgeBin,
    });
    const allowed = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: allowedTxn!.id,
    });
    expect(allowed.error).toBeNull();
    expect(await balanceQty(dims)).toBe(-7);

    await admin.from("items").update({ allow_negative_stock: false }).eq("id", alcoholId);
    await seedStock(client, 50, { ...dims, enteredUnitId: mLUnit });
  });

  it("exact storage dimensions are respected for stock checks", async () => {
    const { client } = await signIn("owner@nolt.local");
    // Stock exists with bin set; consuming with null bin must not use that stock.
    const withBin = {
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: fridgeBin,
    };
    await seedStock(client, 30, { ...withBin, enteredUnitId: mLUnit });
    const beforeWithBin = await balanceQty(withBin);
    const beforeNoBin = await balanceQty({ ...withBin, binId: null });

    const { data: txn } = await createDraft(client, orgA, "consumption");
    await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: txn!.id,
      line_number: 1,
      item_id: alcoholId,
      entered_quantity: 10,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 10,
      source_location_id: primaryA,
      source_storage_area_id: fridgeArea,
      source_bin_id: null,
    });
    const { error } = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: txn!.id,
    });
    expect(error).toBeTruthy();
    expect(await balanceQty(withBin)).toBe(beforeWithBin);
    expect(await balanceQty({ ...withBin, binId: null })).toBe(beforeNoBin);

    const { data: okTxn } = await createDraft(client, orgA, "consumption");
    await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: okTxn!.id,
      line_number: 1,
      item_id: alcoholId,
      entered_quantity: 10,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 10,
      source_location_id: primaryA,
      source_storage_area_id: fridgeArea,
      source_bin_id: fridgeBin,
    });
    const ok = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: okTxn!.id,
    });
    expect(ok.error).toBeNull();
    expect(await balanceQty(withBin)).toBe(beforeWithBin - 10);
  });

  it("failed multi-line completion rolls back completely", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data: txn } = await createDraft(client, orgA, "positive_adjustment");

    await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: txn!.id,
      line_number: 1,
      item_id: alcoholId,
      entered_quantity: 1,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 1,
      destination_location_id: primaryA,
      destination_storage_area_id: fridgeArea,
      destination_bin_id: fridgeBin,
    });

    const { error: badLine } = await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: txn!.id,
      line_number: 2,
      item_id: alcoholId,
      entered_quantity: 1,
      entered_unit_id: boxUnit,
      conversion_multiplier: 1,
      base_quantity: 1,
      destination_location_id: primaryA,
      destination_storage_area_id: fridgeArea,
      destination_bin_id: fridgeBin,
    });
    expect(badLine).toBeNull();

    const beforeLedger = await admin
      .from("inventory_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgA);

    const { error } = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: txn!.id,
    });
    expect(error).toBeTruthy();

    const { data: txnAfter } = await client
      .from("inventory_transactions")
      .select("status")
      .eq("id", txn!.id)
      .single();
    expect(txnAfter?.status).toBe("draft");

    const { count: ledgerForTxn } = await admin
      .from("inventory_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("transaction_id", txn!.id);
    expect(ledgerForTxn ?? 0).toBe(0);

    const afterLedger = await admin
      .from("inventory_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgA);
    expect(afterLedger.count).toBe(beforeLedger.count);
  });

  it("duplicate completion does not double-post", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data: txn } = await createDraft(client, orgA, "receipt");
    await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: txn!.id,
      line_number: 1,
      item_id: alcoholId,
      entered_quantity: 3,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 3,
      destination_location_id: primaryA,
      destination_storage_area_id: fridgeArea,
      destination_bin_id: fridgeBin,
    });

    const first = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: txn!.id,
    });
    expect(first.error).toBeNull();

    const second = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: txn!.id,
    });
    expect(second.error).toBeTruthy();

    const { count } = await admin
      .from("inventory_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("transaction_id", txn!.id);
    expect(count).toBe(1);
  });

  it("concurrent consumption cannot overspend", async () => {
    const { client } = await signIn("owner@nolt.local");
    const dims = {
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: fridgeBin,
    };

    // Isolate a known pool for this race: consume down, then seed exact amount.
    await admin.from("items").update({ allow_negative_stock: false }).eq("id", alcoholId);
    const current = await balanceQty(dims);
    if (current > 0) {
      const { data: drain } = await createDraft(client, orgA, "consumption");
      await client.from("inventory_transaction_lines").insert({
        organization_id: orgA,
        transaction_id: drain!.id,
        line_number: 1,
        item_id: alcoholId,
        entered_quantity: current,
        entered_unit_id: mLUnit,
        conversion_multiplier: 1,
        base_quantity: current,
        source_location_id: primaryA,
        source_storage_area_id: fridgeArea,
        source_bin_id: fridgeBin,
      });
      const drained = await client.rpc("complete_inventory_transaction", {
        p_transaction_id: drain!.id,
      });
      expect(drained.error).toBeNull();
    }
    await seedStock(client, 10, { ...dims, enteredUnitId: mLUnit });
    expect(await balanceQty(dims)).toBe(10);

    async function buildConsumption(qty: number) {
      const signed = await signIn("owner@nolt.local");
      const { data: txn } = await createDraft(signed.client, orgA, "consumption");
      await signed.client.from("inventory_transaction_lines").insert({
        organization_id: orgA,
        transaction_id: txn!.id,
        line_number: 1,
        item_id: alcoholId,
        entered_quantity: qty,
        entered_unit_id: mLUnit,
        conversion_multiplier: 1,
        base_quantity: qty,
        source_location_id: primaryA,
        source_storage_area_id: fridgeArea,
        source_bin_id: fridgeBin,
      });
      return { client: signed.client, txnId: txn!.id };
    }

    const a = await buildConsumption(8);
    const b = await buildConsumption(8);
    const [resultA, resultB] = await Promise.all([
      a.client.rpc("complete_inventory_transaction", { p_transaction_id: a.txnId }),
      b.client.rpc("complete_inventory_transaction", { p_transaction_id: b.txnId }),
    ]);

    const successes = [resultA, resultB].filter((r) => !r.error).length;
    const failures = [resultA, resultB].filter((r) => r.error).length;
    expect(successes).toBe(1);
    expect(failures).toBe(1);
    expect(await balanceQty(dims)).toBe(2);
  });

  it("completion path writes type-specific audit events", async () => {
    const { client, userId } = await signIn("owner@nolt.local");
    const { data: txn } = await createDraft(client, orgA, "receipt", {
      reference_text: "AUDIT-REF",
    });
    await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: txn!.id,
      line_number: 1,
      item_id: alcoholId,
      entered_quantity: 2,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 2,
      destination_location_id: primaryA,
      destination_storage_area_id: fridgeArea,
      destination_bin_id: fridgeBin,
    });
    const completed = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: txn!.id,
    });
    expect(completed.error).toBeNull();

    // App layer writes audit after RPC; mirror that contract here for RLS/integration coverage.
    const { error: auditError } = await client.from("audit_events").insert({
      organization_id: orgA,
      actor_user_id: userId,
      actor_type: "user",
      action: "inventory.receipt.completed",
      entity_type: "inventory_transaction",
      entity_id: txn!.id,
      summary: `Inventory receipt completed: ${txn!.transaction_number}`,
      metadata: { transactionType: "receipt" },
    });
    expect(auditError).toBeNull();

    const { data: events } = await client
      .from("audit_events")
      .select("action, entity_id")
      .eq("organization_id", orgA)
      .eq("entity_id", txn!.id)
      .eq("action", "inventory.receipt.completed");
    expect((events ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("requires variant when item requires_variant", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data: txn } = await createDraft(client, orgA, "positive_adjustment");
    const { error } = await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: txn!.id,
      line_number: 1,
      item_id: glovesId,
      entered_quantity: 1,
      entered_unit_id: glovesBase,
      conversion_multiplier: 1,
      base_quantity: 1,
      destination_location_id: primaryA,
      destination_storage_area_id: topShelf,
    });
    expect(error).toBeTruthy();
  });

  it("completed transactions, lines, ledger are immutable; balances not directly writable", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data: completed } = await client
      .from("inventory_transactions")
      .select("id")
      .eq("status", "completed")
      .limit(1)
      .maybeSingle();
    expect(completed?.id).toBeTruthy();

    const { data: txnUpdated } = await client
      .from("inventory_transactions")
      .update({ notes: "tamper" })
      .eq("id", completed!.id)
      .select("id");
    expect(txnUpdated ?? []).toEqual([]);

    const { data: line } = await client
      .from("inventory_transaction_lines")
      .select("id")
      .eq("transaction_id", completed!.id)
      .limit(1)
      .maybeSingle();

    if (line?.id) {
      const { data: lineUpdated } = await client
        .from("inventory_transaction_lines")
        .update({ notes: "tamper" })
        .eq("id", line.id)
        .select("id");
      expect(lineUpdated ?? []).toEqual([]);
    }

    const { data: ledger } = await client
      .from("inventory_ledger_entries")
      .select("id, quantity_delta")
      .eq("transaction_id", completed!.id)
      .limit(1)
      .maybeSingle();
    expect(ledger?.id).toBeTruthy();
    const { data: ledgerUpdated } = await client
      .from("inventory_ledger_entries")
      .update({ quantity_delta: 999999 })
      .eq("id", ledger!.id)
      .select("id");
    expect(ledgerUpdated ?? []).toEqual([]);

    const { data: balance } = await client
      .from("inventory_balances")
      .select("id, quantity_on_hand")
      .eq("organization_id", orgA)
      .limit(1)
      .maybeSingle();
    expect(balance?.id).toBeTruthy();
    const { data: balanceUpdated } = await client
      .from("inventory_balances")
      .update({ quantity_on_hand: 0 })
      .eq("id", balance!.id)
      .select("id");
    expect(balanceUpdated ?? []).toEqual([]);
  });

  it("balance equals ledger sum and rebuild reproduces it", async () => {
    const { data: balances } = await admin
      .from("inventory_balances")
      .select("item_id, variant_id, location_id, storage_area_id, bin_id, quantity_on_hand")
      .eq("organization_id", orgA);

    for (const balance of balances ?? []) {
      let query = admin
        .from("inventory_ledger_entries")
        .select("quantity_delta")
        .eq("organization_id", orgA)
        .eq("item_id", balance.item_id)
        .eq("location_id", balance.location_id)
        .eq("storage_area_id", balance.storage_area_id);

      query = balance.variant_id
        ? query.eq("variant_id", balance.variant_id)
        : query.is("variant_id", null);
      query = balance.bin_id ? query.eq("bin_id", balance.bin_id) : query.is("bin_id", null);

      const { data: entries } = await query;
      const sum = (entries ?? []).reduce((acc, row) => acc + Number(row.quantity_delta), 0);
      expect(Number(balance.quantity_on_hand)).toBe(sum);
    }

    const snapshot = structuredClone(balances ?? []);
    const { error } = await admin.rpc("rebuild_inventory_balances", {
      p_organization_id: orgA,
    });
    expect(error).toBeNull();

    const { data: rebuilt } = await admin
      .from("inventory_balances")
      .select("item_id, variant_id, location_id, storage_area_id, bin_id, quantity_on_hand")
      .eq("organization_id", orgA);

    expect((rebuilt ?? []).length).toBe(snapshot.length);
    for (const row of snapshot) {
      const match = (rebuilt ?? []).find(
        (r) =>
          r.item_id === row.item_id &&
          r.variant_id === row.variant_id &&
          r.location_id === row.location_id &&
          r.storage_area_id === row.storage_area_id &&
          r.bin_id === row.bin_id,
      );
      expect(Number(match?.quantity_on_hand)).toBe(Number(row.quantity_on_hand));
    }
  });

  it("transaction numbering is unique under concurrent creates", async () => {
    const owner = await signIn("owner@nolt.local");
    const results = await Promise.all([
      createDraft(owner.client, orgA, "receipt"),
      createDraft(owner.client, orgA, "consumption"),
      createDraft(owner.client, orgA, "transfer"),
    ]);
    const numbers = results.map((r) => r.data?.transaction_number).filter(Boolean);
    expect(numbers.length).toBe(3);
    expect(new Set(numbers).size).toBe(3);
    expect(numbers.some((n) => String(n).startsWith("RCV-"))).toBe(true);
    expect(numbers.some((n) => String(n).startsWith("CON-"))).toBe(true);
    expect(numbers.some((n) => String(n).startsWith("XFR-"))).toBe(true);
  });

  it("read-only cannot mutate inventory", async () => {
    const readonly = await signIn("readonly@nolt.local");
    const { error } = await createDraft(readonly.client, orgA, "positive_adjustment");
    expect(error).toBeTruthy();
  });

  it("staff can consume but cannot complete a receipt", async () => {
    const staff = await signIn("multi@nolt.local");
    const { data: receipt, error: receiptCreateError } = await createDraft(
      staff.client,
      orgA,
      "receipt",
    );
    // Staff lacks inventory.receive — draft create should fail under RLS.
    if (!receiptCreateError && receipt) {
      await staff.client.from("inventory_transaction_lines").insert({
        organization_id: orgA,
        transaction_id: receipt.id,
        line_number: 1,
        item_id: alcoholId,
        entered_quantity: 1,
        entered_unit_id: mLUnit,
        conversion_multiplier: 1,
        base_quantity: 1,
        destination_location_id: primaryA,
        destination_storage_area_id: fridgeArea,
        destination_bin_id: fridgeBin,
      });
      const completeReceipt = await staff.client.rpc("complete_inventory_transaction", {
        p_transaction_id: receipt.id,
      });
      expect(completeReceipt.error).toBeTruthy();
    } else {
      expect(receiptCreateError).toBeTruthy();
    }

    const { client: owner } = await signIn("owner@nolt.local");
    const dims = {
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: fridgeBin,
    };
    await seedStock(owner, 12, { ...dims, enteredUnitId: mLUnit });
    const before = await balanceQty(dims);

    const { data: consumption, error: consumptionError } = await createDraft(
      staff.client,
      orgA,
      "consumption",
    );
    expect(consumptionError).toBeNull();
    await staff.client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: consumption!.id,
      line_number: 1,
      item_id: alcoholId,
      entered_quantity: 4,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 4,
      source_location_id: primaryA,
      source_storage_area_id: fridgeArea,
      source_bin_id: fridgeBin,
    });
    const completeConsume = await staff.client.rpc("complete_inventory_transaction", {
      p_transaction_id: consumption!.id,
    });
    expect(completeConsume.error).toBeNull();
    expect(await balanceQty(dims)).toBe(before - 4);
  });

  // ---------------------------------------------------------------------------
  // Phase 2.6 — reversals, reconciliation, immutability hardening
  // ---------------------------------------------------------------------------

  async function completeMovement(
    client: SupabaseClient,
    type: string,
    line: Record<string, unknown>,
    extras: { notes?: string; reference_text?: string } = {},
  ) {
    const { data: txn, error } = await createDraft(client, orgA, type, extras);
    expect(error).toBeNull();
    const { error: lineError } = await client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: txn!.id,
      line_number: 1,
      ...line,
    });
    expect(lineError).toBeNull();
    const { data: completed, error: completeError } = await client.rpc(
      "complete_inventory_transaction",
      { p_transaction_id: txn!.id },
    );
    expect(completeError).toBeNull();
    return { id: txn!.id, completed };
  }

  it("receipt reversal removes received stock and links both ways", async () => {
    const { client, userId } = await signIn("owner@nolt.local");
    const dims = {
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: fridgeBin,
    };
    const before = await balanceQty(dims);
    const { id: originalId } = await completeMovement(client, "receipt", {
      item_id: alcoholId,
      entered_quantity: 15,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 15,
      destination_location_id: primaryA,
      destination_storage_area_id: fridgeArea,
      destination_bin_id: fridgeBin,
    });
    expect(await balanceQty(dims)).toBe(before + 15);

    const { data: originalLedger } = await admin
      .from("inventory_ledger_entries")
      .select("quantity_delta, location_id, storage_area_id, bin_id, effect_role")
      .eq("transaction_id", originalId)
      .order("id");

    const { data: reversal, error } = await client.rpc("reverse_inventory_transaction", {
      p_transaction_id: originalId,
      p_reason: "Receipt posted in error",
    });
    expect(error).toBeNull();
    expect(reversal?.transaction_type).toBe("reversal");
    expect(reversal?.status).toBe("completed");
    expect(String(reversal?.transaction_number ?? "")).toMatch(/^REV-/);
    expect(reversal?.reverses_transaction_id).toBe(originalId);
    expect(await balanceQty(dims)).toBe(before);

    const { data: originalAfter } = await admin
      .from("inventory_transactions")
      .select("status, reversed_by_transaction_id")
      .eq("id", originalId)
      .single();
    expect(originalAfter?.status).toBe("reversed");
    expect(originalAfter?.reversed_by_transaction_id).toBe(reversal!.id);

    const { data: reverseLedger } = await admin
      .from("inventory_ledger_entries")
      .select("quantity_delta, location_id, storage_area_id, bin_id, effect_role")
      .eq("transaction_id", reversal!.id)
      .order("id");
    expect(reverseLedger).toHaveLength(originalLedger?.length ?? 0);
    for (let i = 0; i < (originalLedger?.length ?? 0); i += 1) {
      expect(Number(reverseLedger?.[i]?.quantity_delta)).toBe(
        -Number(originalLedger?.[i]?.quantity_delta),
      );
      expect(reverseLedger?.[i]?.location_id).toBe(originalLedger?.[i]?.location_id);
      expect(reverseLedger?.[i]?.effect_role).toBe(originalLedger?.[i]?.effect_role);
    }

    const { error: auditError } = await client.from("audit_events").insert({
      organization_id: orgA,
      actor_user_id: userId,
      actor_type: "user",
      action: "inventory.transaction.reversed",
      entity_type: "inventory_transaction",
      entity_id: originalId,
      summary: "Inventory transaction reversed",
      metadata: { reversalTransactionId: reversal!.id },
    });
    expect(auditError).toBeNull();
  });

  it("consumption reversal restores stock", async () => {
    const { client } = await signIn("owner@nolt.local");
    const dims = {
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: fridgeBin,
    };
    await seedStock(client, 40, { ...dims, enteredUnitId: mLUnit });
    const beforeConsume = await balanceQty(dims);
    const { id } = await completeMovement(client, "consumption", {
      item_id: alcoholId,
      entered_quantity: 11,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 11,
      source_location_id: primaryA,
      source_storage_area_id: fridgeArea,
      source_bin_id: fridgeBin,
    });
    expect(await balanceQty(dims)).toBe(beforeConsume - 11);

    const { error } = await client.rpc("reverse_inventory_transaction", {
      p_transaction_id: id,
      p_reason: "Consumption recorded against wrong item",
    });
    expect(error).toBeNull();
    expect(await balanceQty(dims)).toBe(beforeConsume);
  });

  it("adjustment reversal restores prior balance", async () => {
    const { client } = await signIn("owner@nolt.local");
    const dims = {
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: null as string | null,
    };
    const before = await balanceQty(dims);
    const { id: positiveId } = await completeMovement(client, "positive_adjustment", {
      item_id: alcoholId,
      entered_quantity: 7,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 7,
      destination_location_id: primaryA,
      destination_storage_area_id: fridgeArea,
    });
    expect(await balanceQty(dims)).toBe(before + 7);

    const { error: reversePositiveError } = await client.rpc("reverse_inventory_transaction", {
      p_transaction_id: positiveId,
      p_reason: "Positive adjustment correction",
    });
    expect(reversePositiveError).toBeNull();
    expect(await balanceQty(dims)).toBe(before);

    await seedStock(client, 9, { ...dims, enteredUnitId: mLUnit });
    const mid = await balanceQty(dims);
    const { id: negativeId } = await completeMovement(
      client,
      "negative_adjustment",
      {
        item_id: alcoholId,
        entered_quantity: 3,
        entered_unit_id: mLUnit,
        conversion_multiplier: 1,
        base_quantity: 3,
        source_location_id: primaryA,
        source_storage_area_id: fridgeArea,
      },
      { notes: "Shrinkage" },
    );
    expect(await balanceQty(dims)).toBe(mid - 3);

    const { error: reverseNegativeError } = await client.rpc("reverse_inventory_transaction", {
      p_transaction_id: negativeId,
      p_reason: "Negative adjustment correction",
    });
    expect(reverseNegativeError).toBeNull();
    expect(await balanceQty(dims)).toBe(mid);
  });

  it("transfer reversal restores source and destination", async () => {
    const { client } = await signIn("owner@nolt.local");
    const source = {
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: fridgeBin,
    };
    const dest = {
      itemId: alcoholId,
      locationId: storageA,
      storageAreaId: warehouseArea,
      binId: null as string | null,
    };
    await seedStock(client, 25, { ...source, enteredUnitId: mLUnit });
    const sourceBefore = await balanceQty(source);
    const destBefore = await balanceQty(dest);

    const { id } = await completeMovement(client, "transfer", {
      item_id: alcoholId,
      entered_quantity: 8,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 8,
      source_location_id: primaryA,
      source_storage_area_id: fridgeArea,
      source_bin_id: fridgeBin,
      destination_location_id: storageA,
      destination_storage_area_id: warehouseArea,
    });
    expect(await balanceQty(source)).toBe(sourceBefore - 8);
    expect(await balanceQty(dest)).toBe(destBefore + 8);

    const { error } = await client.rpc("reverse_inventory_transaction", {
      p_transaction_id: id,
      p_reason: "Transfer sent to wrong site",
    });
    expect(error).toBeNull();
    expect(await balanceQty(source)).toBe(sourceBefore);
    expect(await balanceQty(dest)).toBe(destBefore);
  });

  it("original transaction cannot be reversed twice", async () => {
    const { client } = await signIn("owner@nolt.local");
    const dims = {
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: fridgeBin,
    };
    await seedStock(client, 5, { ...dims, enteredUnitId: mLUnit });
    const { id } = await completeMovement(client, "receipt", {
      item_id: alcoholId,
      entered_quantity: 5,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 5,
      destination_location_id: primaryA,
      destination_storage_area_id: fridgeArea,
      destination_bin_id: fridgeBin,
    });

    const first = await client.rpc("reverse_inventory_transaction", {
      p_transaction_id: id,
      p_reason: "First reverse",
    });
    expect(first.error).toBeNull();

    const second = await client.rpc("reverse_inventory_transaction", {
      p_transaction_id: id,
      p_reason: "Second reverse",
    });
    expect(second.error).toBeTruthy();
    expect(second.error?.message ?? "").toMatch(/already reversed/i);
  });

  it("unauthorized user cannot reverse", async () => {
    const owner = await signIn("owner@nolt.local");
    const dims = {
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: fridgeBin,
    };
    await seedStock(owner.client, 6, { ...dims, enteredUnitId: mLUnit });
    const { id } = await completeMovement(owner.client, "receipt", {
      item_id: alcoholId,
      entered_quantity: 6,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 6,
      destination_location_id: primaryA,
      destination_storage_area_id: fridgeArea,
      destination_bin_id: fridgeBin,
    });

    const staff = await signIn("multi@nolt.local");
    const { error } = await staff.client.rpc("reverse_inventory_transaction", {
      p_transaction_id: id,
      p_reason: "Staff should not reverse",
    });
    expect(error).toBeTruthy();
    expect(error?.message ?? "").toMatch(/permission denied/i);

    const { data: after } = await admin
      .from("inventory_transactions")
      .select("status, reversed_by_transaction_id")
      .eq("id", id)
      .single();
    expect(after?.status).toBe("completed");
    expect(after?.reversed_by_transaction_id).toBeNull();
  });

  it("user without access to all affected locations cannot reverse", async () => {
    const owner = await signIn("owner@nolt.local");
    const source = {
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: fridgeBin,
    };
    await seedStock(owner.client, 12, { ...source, enteredUnitId: mLUnit });
    const { id } = await completeMovement(owner.client, "transfer", {
      item_id: alcoholId,
      entered_quantity: 4,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 4,
      source_location_id: primaryA,
      source_storage_area_id: fridgeArea,
      source_bin_id: fridgeBin,
      destination_location_id: storageA,
      destination_storage_area_id: warehouseArea,
    });

    const restricted = await signIn("restricted@nolt.local");
    const { error } = await restricted.client.rpc("reverse_inventory_transaction", {
      p_transaction_id: id,
      p_reason: "Missing storage location access",
    });
    expect(error).toBeTruthy();
    expect(error?.message ?? "").toMatch(/location|accessible|permission/i);

    const { data: after } = await admin
      .from("inventory_transactions")
      .select("status")
      .eq("id", id)
      .single();
    expect(after?.status).toBe("completed");
  });

  it("reversal respects negative-stock rules and failed reversal is atomic", async () => {
    const { client } = await signIn("owner@nolt.local");
    await admin.from("items").update({ allow_negative_stock: false }).eq("id", alcoholId);
    const dims = {
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: fridgeBin,
    };

    const current = await balanceQty(dims);
    if (current > 0) {
      await completeMovement(client, "consumption", {
        item_id: alcoholId,
        entered_quantity: current,
        entered_unit_id: mLUnit,
        conversion_multiplier: 1,
        base_quantity: current,
        source_location_id: primaryA,
        source_storage_area_id: fridgeArea,
        source_bin_id: fridgeBin,
      });
    }

    const { id: receiptId } = await completeMovement(client, "receipt", {
      item_id: alcoholId,
      entered_quantity: 10,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 10,
      destination_location_id: primaryA,
      destination_storage_area_id: fridgeArea,
      destination_bin_id: fridgeBin,
    });
    expect(await balanceQty(dims)).toBe(10);

    await completeMovement(client, "consumption", {
      item_id: alcoholId,
      entered_quantity: 10,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 10,
      source_location_id: primaryA,
      source_storage_area_id: fridgeArea,
      source_bin_id: fridgeBin,
    });
    expect(await balanceQty(dims)).toBe(0);

    const txnCountBefore = (
      await admin
        .from("inventory_transactions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgA)
    ).count;

    const { data: reversal, error } = await client.rpc("reverse_inventory_transaction", {
      p_transaction_id: receiptId,
      p_reason: "Would create forbidden negative stock",
    });
    expect(error).toBeTruthy();
    expect(error?.message ?? "").toMatch(/insufficient stock/i);
    expect(reversal).toBeNull();
    expect(await balanceQty(dims)).toBe(0);

    const { data: original } = await admin
      .from("inventory_transactions")
      .select("status, reversed_by_transaction_id")
      .eq("id", receiptId)
      .single();
    expect(original?.status).toBe("completed");
    expect(original?.reversed_by_transaction_id).toBeNull();

    const txnCountAfter = (
      await admin
        .from("inventory_transactions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgA)
    ).count;
    expect(txnCountAfter).toBe(txnCountBefore);

    const { data: orphanReversals } = await admin
      .from("inventory_transactions")
      .select("id")
      .eq("reverses_transaction_id", receiptId);
    expect(orphanReversals ?? []).toHaveLength(0);
  });

  it("concurrent reversal attempts result in one success only", async () => {
    const owner = await signIn("owner@nolt.local");
    const dims = {
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: fridgeBin,
    };
    await seedStock(owner.client, 14, { ...dims, enteredUnitId: mLUnit });
    const { id } = await completeMovement(owner.client, "receipt", {
      item_id: alcoholId,
      entered_quantity: 14,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 14,
      destination_location_id: primaryA,
      destination_storage_area_id: fridgeArea,
      destination_bin_id: fridgeBin,
    });

    const a = await signIn("owner@nolt.local");
    const b = await signIn("admin@nolt.local");
    const [resultA, resultB] = await Promise.all([
      a.client.rpc("reverse_inventory_transaction", {
        p_transaction_id: id,
        p_reason: "Concurrent A",
      }),
      b.client.rpc("reverse_inventory_transaction", {
        p_transaction_id: id,
        p_reason: "Concurrent B",
      }),
    ]);

    const successes = [resultA, resultB].filter((r) => !r.error).length;
    const failures = [resultA, resultB].filter((r) => r.error).length;
    expect(successes).toBe(1);
    expect(failures).toBe(1);

    const { data: original } = await admin
      .from("inventory_transactions")
      .select("status, reversed_by_transaction_id")
      .eq("id", id)
      .single();
    expect(original?.status).toBe("reversed");
    expect(original?.reversed_by_transaction_id).toBeTruthy();

    const { data: reversals } = await admin
      .from("inventory_transactions")
      .select("id")
      .eq("reverses_transaction_id", id);
    expect(reversals).toHaveLength(1);
  });

  it("balance equals ledger sum and rebuild reproduces balances", async () => {
    const { client } = await signIn("owner@nolt.local");
    const dims = {
      itemId: alcoholId,
      locationId: primaryA,
      storageAreaId: fridgeArea,
      binId: fridgeBin,
    };
    await seedStock(client, 18, { ...dims, enteredUnitId: mLUnit });
    const { id: receiptId } = await completeMovement(client, "receipt", {
      item_id: alcoholId,
      entered_quantity: 3,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 3,
      destination_location_id: primaryA,
      destination_storage_area_id: fridgeArea,
      destination_bin_id: fridgeBin,
    });
    await completeMovement(client, "consumption", {
      item_id: alcoholId,
      entered_quantity: 2,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 2,
      source_location_id: primaryA,
      source_storage_area_id: fridgeArea,
      source_bin_id: fridgeBin,
    });
    await client.rpc("reverse_inventory_transaction", {
      p_transaction_id: receiptId,
      p_reason: "Reconcile path coverage",
    });

    const { data: mismatches, error: reconcileError } = await client.rpc(
      "reconcile_inventory_balances",
      { p_organization_id: orgA },
    );
    expect(reconcileError).toBeNull();
    expect(mismatches ?? []).toHaveLength(0);

    const beforeRebuild = await balanceQty(dims);
    const { error: rebuildError } = await client.rpc("rebuild_inventory_balances", {
      p_organization_id: orgA,
    });
    expect(rebuildError).toBeNull();
    expect(await balanceQty(dims)).toBe(beforeRebuild);

    const { data: afterRebuildMismatches } = await client.rpc("reconcile_inventory_balances", {
      p_organization_id: orgA,
    });
    expect(afterRebuildMismatches ?? []).toHaveLength(0);

    const staff = await signIn("multi@nolt.local");
    const { error: staffRebuildError } = await staff.client.rpc("rebuild_inventory_balances", {
      p_organization_id: orgA,
    });
    expect(staffRebuildError).toBeTruthy();
  });

  it("completed and reversed records remain immutable to tenant updates", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { id } = await completeMovement(client, "receipt", {
      item_id: alcoholId,
      entered_quantity: 2,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 2,
      destination_location_id: primaryA,
      destination_storage_area_id: fridgeArea,
      destination_bin_id: fridgeBin,
    });

    const { error: editCompleted } = await client
      .from("inventory_transactions")
      .update({ notes: "tamper" })
      .eq("id", id);
    expect(editCompleted).toBeTruthy();

    const { data: reversal } = await client.rpc("reverse_inventory_transaction", {
      p_transaction_id: id,
      p_reason: "Immutability coverage",
    });
    expect(reversal).toBeTruthy();

    const { error: editReversed } = await client
      .from("inventory_transactions")
      .update({ notes: "tamper reversed" })
      .eq("id", id);
    expect(editReversed).toBeTruthy();

    const { error: editReversal } = await client
      .from("inventory_transactions")
      .update({ notes: "tamper reversal row" })
      .eq("id", reversal!.id);
    expect(editReversal).toBeTruthy();

    const { error: unlink } = await client
      .from("inventory_transactions")
      .update({ reverses_transaction_id: null })
      .eq("id", reversal!.id);
    expect(unlink).toBeTruthy();

    const { error: ledgerEdit } = await client
      .from("inventory_ledger_entries")
      .update({ quantity_delta: 0 })
      .eq("transaction_id", id);
    expect(ledgerEdit).toBeTruthy();

    const { error: balanceEdit } = await client
      .from("inventory_balances")
      .update({ quantity_on_hand: 9999 })
      .eq("organization_id", orgA)
      .eq("item_id", alcoholId);
    expect(balanceEdit).toBeTruthy();
  });

  it("tenants cannot create reversal drafts or set link columns directly", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { error: createReversal } = await createDraft(client, orgA, "reversal");
    expect(createReversal).toBeTruthy();

    const { data: receipt } = await createDraft(client, orgA, "receipt");
    const { error: setLink } = await client
      .from("inventory_transactions")
      .update({ reverses_transaction_id: receipt!.id })
      .eq("id", receipt!.id);
    expect(setLink).toBeTruthy();
  });

  it("completion still independently validates location access", async () => {
    const owner = await signIn("owner@nolt.local");
    const restricted = await signIn("restricted@nolt.local");

    // Owner creates a draft the restricted user can see/manage type-wise, then
    // service role plants an unauthorized destination to prove complete still blocks.
    const { data: txn } = await createDraft(owner.client, orgA, "positive_adjustment");
    await admin.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: txn!.id,
      line_number: 1,
      item_id: alcoholId,
      entered_quantity: 1,
      entered_unit_id: mLUnit,
      conversion_multiplier: 1,
      base_quantity: 1,
      destination_location_id: storageA,
      destination_storage_area_id: warehouseArea,
    });

    const { error } = await restricted.client.rpc("complete_inventory_transaction", {
      p_transaction_id: txn!.id,
    });
    expect(error).toBeTruthy();
    expect(error?.message ?? "").toMatch(/location|accessible|permission/i);
  });
});

