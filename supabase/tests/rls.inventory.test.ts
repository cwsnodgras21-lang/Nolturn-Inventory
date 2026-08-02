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

describe.skipIf(!enabled)("Phase 2.4 inventory ledger RLS and integrity", () => {
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
  let topShelf: string;
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
      .select("id, code")
      .eq("location_id", primaryA);
    fridgeArea = areas?.find((a) => a.code === "MED-FRIDGE")?.id ?? "";
    topShelf = areas?.find((a) => a.code === "SUPPLY-CAB-A-TOP")?.id ?? "";

    const { data: units } = await admin
      .from("units_of_measure")
      .select("id, symbol")
      .eq("organization_id", orgA);
    mLUnit = units?.find((u) => u.symbol === "mL")?.id ?? "";
    boxUnit = units?.find((u) => u.symbol === "box")?.id ?? "";

    if (!primaryA || !alcoholId || !glovesId || !mediumVariant || !fridgeArea || !topShelf) {
      throw new Error("Bootstrap inventory fixtures missing.");
    }
  });

  async function createDraft(client: SupabaseClient, orgId: string) {
    return client
      .from("inventory_transactions")
      .insert({
        organization_id: orgId,
        transaction_type: "positive_adjustment",
        status: "draft",
        transaction_number: "",
        notes: `test ${Date.now()}`,
      })
      .select("id, transaction_number, status")
      .single();
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
    expect(keysFor("location_manager").has("inventory.transfer")).toBe(true);
    expect(keysFor("purchasing_manager").has("inventory.read")).toBe(true);
    expect(keysFor("purchasing_manager").has("inventory.receive")).toBe(true);
    expect(keysFor("purchasing_manager").has("inventory.adjust")).toBe(false);
    expect(keysFor("staff").has("inventory.consume")).toBe(true);
    expect(keysFor("staff").has("inventory.receive")).toBe(false);
    expect(keysFor("read_only").has("inventory.read")).toBe(true);
    expect(keysFor("read_only").has("inventory.adjust")).toBe(false);
    expect(keysFor("read_only").has("inventory.receive")).toBe(false);
  });

  it("positive adjustment increases balance with correct conversion", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data: txn, error } = await createDraft(client, orgA);
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

    const before = await client
      .from("inventory_balances")
      .select("quantity_on_hand")
      .eq("item_id", alcoholId)
      .eq("location_id", primaryA)
      .eq("storage_area_id", fridgeArea)
      .is("variant_id", null)
      .is("bin_id", null)
      .maybeSingle();

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

    const after = await client
      .from("inventory_balances")
      .select("quantity_on_hand")
      .eq("item_id", alcoholId)
      .eq("location_id", primaryA)
      .eq("storage_area_id", fridgeArea)
      .is("variant_id", null)
      .is("bin_id", null)
      .maybeSingle();

    const beforeQty = Number(before.data?.quantity_on_hand ?? 0);
    expect(after.data).toBeTruthy();
    expect(Number(after.data?.quantity_on_hand)).toBe(beforeQty + 500);
  });

  it("requires variant when item requires_variant", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data: txn } = await createDraft(client, orgA);
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

  it("blocks cross-tenant inventory access", async () => {
    const ownerB = await signIn("other-owner@nolt.local");
    const { data } = await ownerB.client
      .from("inventory_balances")
      .select("id")
      .eq("organization_id", orgA);
    expect(data ?? []).toEqual([]);
  });

  it("restricted user cannot complete into unauthorized location", async () => {
    const restricted = await signIn("restricted@nolt.local");
    const { data: txn } = await createDraft(restricted.client, orgA);
    const { data: wh } = await admin
      .from("storage_areas")
      .select("id")
      .eq("location_id", storageA)
      .eq("code", "WH-MAIN")
      .maybeSingle();

    const { error: lineError } = await restricted.client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: txn!.id,
      line_number: 1,
      item_id: alcoholId,
      entered_quantity: 1,
      entered_unit_id: alcoholBase,
      conversion_multiplier: 1,
      base_quantity: 1,
      destination_location_id: storageA,
      destination_storage_area_id: wh!.id,
    });
    expect(lineError).toBeTruthy();
  });

  it("duplicate completion does not duplicate stock", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data: txn } = await createDraft(client, orgA);
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
    });

    const first = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: txn!.id,
    });
    expect(first.error).toBeNull();

    const { data: ledgerCount } = await admin
      .from("inventory_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("transaction_id", txn!.id);

    const second = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: txn!.id,
    });
    expect(second.error).toBeTruthy();

    const { count } = await admin
      .from("inventory_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("transaction_id", txn!.id);
    expect(count).toBe(ledgerCount === null ? 1 : count);
    expect(count).toBe(1);
  });

  it("failed multi-line completion rolls back completely", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data: txn } = await createDraft(client, orgA);

    // Line 1 valid
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
    });

    // Line 2 uses a packaging unit with no conversion to mL base (box on alcohol)
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
      createDraft(owner.client, orgA),
      createDraft(owner.client, orgA),
      createDraft(owner.client, orgA),
    ]);
    const numbers = results.map((r) => r.data?.transaction_number).filter(Boolean);
    expect(numbers.length).toBe(3);
    expect(new Set(numbers).size).toBe(3);
  });

  it("read-only cannot mutate inventory", async () => {
    const readonly = await signIn("readonly@nolt.local");
    const { error } = await createDraft(readonly.client, orgA);
    expect(error).toBeTruthy();
  });
});
