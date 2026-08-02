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

describe.skipIf(!enabled)("Phase 3.3 lot tracking RLS and workflow", () => {
  let admin: SupabaseClient;
  let orgA: string;
  let orgB: string;
  let primaryA: string;
  let storageA: string;
  let primaryB: string;
  let alcoholId: string;
  let alcoholBase: string;
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
    const { data: locsB } = await admin.from("locations").select("id, code").eq("organization_id", orgB);
    primaryB = locsB?.find((l) => l.code === "PRIMARY")?.id ?? "";

    const { data: items } = await admin
      .from("items")
      .select("id, sku, base_unit_id, tracking_mode")
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
    mLUnit = units?.find((u) => u.symbol === "mL")?.id ?? alcoholBase;

    const suffix = Date.now().toString(36);
    const { data: lotItem, error: itemError } = await admin
      .from("items")
      .insert({
        organization_id: orgA,
        name: `Lot Serum ${suffix}`,
        sku: `LOT-SERUM-${suffix}`,
        base_unit_id: mLUnit,
        default_entry_unit_id: mLUnit,
        status: "active",
        tracking_mode: "lot",
      })
      .select("id, base_unit_id")
      .single();
    if (itemError || !lotItem) throw itemError ?? new Error("Failed to create lot item");
    lotItemId = lotItem.id;
    lotItemBase = lotItem.base_unit_id;

    if (!primaryA || !storageA || !primaryB || !alcoholId || !fridgeArea || !fridgeBin || !warehouseArea) {
      throw new Error("Bootstrap lot fixtures missing.");
    }
  });

  async function createLot(
    client: SupabaseClient,
    opts: {
      itemId?: string;
      lotNumber: string;
      expirationDate?: string | null;
      status?: string;
      variantId?: string | null;
      organizationId?: string;
    },
  ) {
    return client
      .from("inventory_lots")
      .insert({
        organization_id: opts.organizationId ?? orgA,
        item_id: opts.itemId ?? lotItemId,
        variant_id: opts.variantId ?? null,
        lot_number: opts.lotNumber,
        expiration_date: opts.expirationDate ?? null,
        status: opts.status ?? "active",
      })
      .select("id, lot_number, status, expiration_date")
      .single();
  }

  async function createDraft(client: SupabaseClient, transactionType: string) {
    return client
      .from("inventory_transactions")
      .insert({
        organization_id: orgA,
        transaction_type: transactionType,
        status: "draft",
        transaction_number: "",
        notes: `lot test ${transactionType} ${Date.now()}`,
      })
      .select("id")
      .single();
  }

  async function addLine(
    client: SupabaseClient,
    opts: {
      transactionId: string;
      itemId: string;
      quantity: number;
      lotId?: string | null;
      sourceLocationId?: string | null;
      sourceAreaId?: string | null;
      sourceBinId?: string | null;
      destLocationId?: string | null;
      destAreaId?: string | null;
      destBinId?: string | null;
      unitId?: string;
    },
  ) {
    return client.from("inventory_transaction_lines").insert({
      organization_id: orgA,
      transaction_id: opts.transactionId,
      line_number: 1,
      item_id: opts.itemId,
      variant_id: null,
      lot_id: opts.lotId ?? null,
      entered_quantity: opts.quantity,
      entered_unit_id: opts.unitId ?? lotItemBase,
      conversion_multiplier: 1,
      base_quantity: opts.quantity,
      source_location_id: opts.sourceLocationId ?? null,
      source_storage_area_id: opts.sourceAreaId ?? null,
      source_bin_id: opts.sourceBinId ?? null,
      destination_location_id: opts.destLocationId ?? null,
      destination_storage_area_id: opts.destAreaId ?? null,
      destination_bin_id: opts.destBinId ?? null,
    });
  }

  async function lotBalance(lotId: string, locationId = primaryA, areaId = fridgeArea, binId: string | null = fridgeBin) {
    let query = admin
      .from("inventory_balances")
      .select("quantity_on_hand")
      .eq("organization_id", orgA)
      .eq("item_id", lotItemId)
      .eq("lot_id", lotId)
      .eq("location_id", locationId)
      .eq("storage_area_id", areaId)
      .is("variant_id", null);
    query = binId ? query.eq("bin_id", binId) : query.is("bin_id", null);
    const { data } = await query.maybeSingle();
    return Number(data?.quantity_on_hand ?? 0);
  }

  it("role mappings include inventory.lots permissions", async () => {
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
      expect(keysFor(key).has("inventory.lots.read")).toBe(true);
      expect(keysFor(key).has("inventory.lots.manage")).toBe(true);
    }
    for (const key of ["location_manager", "staff", "read_only"]) {
      expect(keysFor(key).has("inventory.lots.read")).toBe(true);
    }
  });

  it("isolates inventory_lots across tenants", async () => {
    const { client: ownerA } = await signIn("owner@nolt.local");
    const { data: lot, error } = await createLot(ownerA, { lotNumber: `ISO-${Date.now()}` });
    expect(error).toBeNull();
    expect(lot?.id).toBeTruthy();

    const { client: ownerB } = await signIn("other-owner@nolt.local");
    const { data: visible } = await ownerB
      .from("inventory_lots")
      .select("id")
      .eq("id", lot!.id)
      .maybeSingle();
    expect(visible).toBeNull();
  });

  it("quantity-only items continue working without lots", async () => {
    const { client } = await signIn("owner@nolt.local");
    const before = await admin
      .from("inventory_balances")
      .select("quantity_on_hand")
      .eq("organization_id", orgA)
      .eq("item_id", alcoholId)
      .eq("location_id", primaryA)
      .eq("storage_area_id", fridgeArea)
      .eq("bin_id", fridgeBin)
      .is("variant_id", null)
      .is("lot_id", null)
      .maybeSingle();
    const beforeQty = Number(before.data?.quantity_on_hand ?? 0);

    const { data: txn, error: txnError } = await createDraft(client, "receipt");
    expect(txnError).toBeNull();
    const { error: lineError } = await addLine(client, {
      transactionId: txn!.id,
      itemId: alcoholId,
      quantity: 3,
      lotId: null,
      destLocationId: primaryA,
      destAreaId: fridgeArea,
      destBinId: fridgeBin,
      unitId: alcoholBase,
    });
    expect(lineError).toBeNull();
    const { error: completeError } = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: txn!.id,
    });
    expect(completeError).toBeNull();

    const after = await admin
      .from("inventory_balances")
      .select("quantity_on_hand")
      .eq("organization_id", orgA)
      .eq("item_id", alcoholId)
      .eq("location_id", primaryA)
      .eq("storage_area_id", fridgeArea)
      .eq("bin_id", fridgeBin)
      .is("variant_id", null)
      .is("lot_id", null)
      .maybeSingle();
    expect(Number(after.data?.quantity_on_hand ?? 0)).toBe(beforeQty + 3);
  });

  it("lot-tracked items require a lot and reject mismatched lots", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data: lot } = await createLot(client, { lotNumber: `REQ-${Date.now()}` });

    const { data: txn1 } = await createDraft(client, "receipt");
    const { error: missingLot } = await addLine(client, {
      transactionId: txn1!.id,
      itemId: lotItemId,
      quantity: 5,
      lotId: null,
      destLocationId: primaryA,
      destAreaId: fridgeArea,
      destBinId: fridgeBin,
    });
    expect(missingLot?.message ?? "").toMatch(/lot-tracked items require a lot/i);

    const { error: quantityLotError } = await createLot(client, {
      itemId: alcoholId,
      lotNumber: `MISMATCH-${Date.now()}`,
    });
    expect(quantityLotError?.message ?? "").toMatch(/lot-tracked|lots can only be created/i);

    const { data: otherItem } = await admin
      .from("items")
      .insert({
        organization_id: orgA,
        name: `Other Lot Item ${Date.now()}`,
        sku: `LOT-OTHER-${Date.now()}`,
        base_unit_id: mLUnit,
        default_entry_unit_id: mLUnit,
        status: "active",
        tracking_mode: "lot",
      })
      .select("id")
      .single();
    const { data: wrongLot } = await createLot(client, {
      itemId: otherItem!.id,
      lotNumber: `WRONG-${Date.now()}`,
    });

    const { data: txn2 } = await createDraft(client, "receipt");
    const { error: mismatch } = await addLine(client, {
      transactionId: txn2!.id,
      itemId: lotItemId,
      quantity: 5,
      lotId: wrongLot!.id,
      destLocationId: primaryA,
      destAreaId: fridgeArea,
      destBinId: fridgeBin,
    });
    expect(mismatch?.message ?? "").toMatch(/lot must match the item/i);

    const { data: txn3 } = await createDraft(client, "receipt");
    const { error: okLine } = await addLine(client, {
      transactionId: txn3!.id,
      itemId: lotItemId,
      quantity: 5,
      lotId: lot!.id,
      destLocationId: primaryA,
      destAreaId: fridgeArea,
      destBinId: fridgeBin,
    });
    expect(okLine).toBeNull();
    const { error: completeError } = await client.rpc("complete_inventory_transaction", {
      p_transaction_id: txn3!.id,
    });
    expect(completeError).toBeNull();
    expect(await lotBalance(lot!.id)).toBe(5);
  });

  it("receipt/consumption/transfer/reversal preserve lot balances", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data: lot } = await createLot(client, {
      lotNumber: `FLOW-${Date.now()}`,
      expirationDate: "2099-01-15",
    });

    const { data: receipt } = await createDraft(client, "receipt");
    await addLine(client, {
      transactionId: receipt!.id,
      itemId: lotItemId,
      quantity: 20,
      lotId: lot!.id,
      destLocationId: primaryA,
      destAreaId: fridgeArea,
      destBinId: fridgeBin,
    });
    expect(
      (
        await client.rpc("complete_inventory_transaction", {
          p_transaction_id: receipt!.id,
        })
      ).error,
    ).toBeNull();
    expect(await lotBalance(lot!.id)).toBe(20);

    const { data: consume } = await createDraft(client, "consumption");
    await addLine(client, {
      transactionId: consume!.id,
      itemId: lotItemId,
      quantity: 4,
      lotId: lot!.id,
      sourceLocationId: primaryA,
      sourceAreaId: fridgeArea,
      sourceBinId: fridgeBin,
    });
    expect(
      (
        await client.rpc("complete_inventory_transaction", {
          p_transaction_id: consume!.id,
        })
      ).error,
    ).toBeNull();
    expect(await lotBalance(lot!.id)).toBe(16);

    const { data: transfer } = await createDraft(client, "transfer");
    await addLine(client, {
      transactionId: transfer!.id,
      itemId: lotItemId,
      quantity: 6,
      lotId: lot!.id,
      sourceLocationId: primaryA,
      sourceAreaId: fridgeArea,
      sourceBinId: fridgeBin,
      destLocationId: storageA,
      destAreaId: warehouseArea,
      destBinId: null,
    });
    expect(
      (
        await client.rpc("complete_inventory_transaction", {
          p_transaction_id: transfer!.id,
        })
      ).error,
    ).toBeNull();
    expect(await lotBalance(lot!.id, primaryA, fridgeArea, fridgeBin)).toBe(10);
    expect(await lotBalance(lot!.id, storageA, warehouseArea, null)).toBe(6);

    const { data: reversed, error: reverseError } = await client.rpc("reverse_inventory_transaction", {
      p_transaction_id: transfer!.id,
      p_reason: "lot reverse test",
    });
    expect(reverseError).toBeNull();
    expect(reversed).toBeTruthy();
    expect(await lotBalance(lot!.id, primaryA, fridgeArea, fridgeBin)).toBe(16);
    expect(await lotBalance(lot!.id, storageA, warehouseArea, null)).toBe(0);

    const { data: ledger } = await admin
      .from("inventory_ledger_entries")
      .select("lot_id")
      .eq("transaction_id", transfer!.id);
    expect(ledger?.every((row) => row.lot_id === lot!.id)).toBe(true);
  });

  it("quarantined lots cannot be used for movements", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data: lot } = await createLot(client, {
      lotNumber: `Q-${Date.now()}`,
      status: "quarantined",
    });

    const { data: txn } = await createDraft(client, "receipt");
    const { error } = await addLine(client, {
      transactionId: txn!.id,
      itemId: lotItemId,
      quantity: 2,
      lotId: lot!.id,
      destLocationId: primaryA,
      destAreaId: fridgeArea,
      destBinId: fridgeBin,
    });
    expect(error?.message ?? "").toMatch(/lot is not available/i);
  });

  it("PO receiving supports creating lots and count reconcile uses lot dims", async () => {
    const { client } = await signIn("owner@nolt.local");
    const lotNumber = `POLOT-${Date.now()}`;

    const { data: supplier } = await client
      .from("suppliers")
      .insert({ organization_id: orgA, name: `Lot Supplier ${Date.now()}`, status: "active" })
      .select("id")
      .single();

    const { data: po } = await client
      .from("purchase_orders")
      .insert({
        organization_id: orgA,
        supplier_id: supplier!.id,
        ship_to_location_id: primaryA,
        order_date: new Date().toISOString().slice(0, 10),
        status: "draft",
        po_number: "",
      })
      .select("id")
      .single();

    const { data: poLine } = await client
      .from("purchase_order_lines")
      .insert({
        organization_id: orgA,
        purchase_order_id: po!.id,
        line_number: 1,
        item_id: lotItemId,
        variant_id: null,
        ordered_quantity: 12,
        purchase_unit_id: lotItemBase,
        unit_cost: 1,
      })
      .select("id")
      .single();

    expect(
      (await client.rpc("submit_purchase_order", { p_purchase_order_id: po!.id })).error,
    ).toBeNull();

    const { data: receiptTxn, error: receiveError } = await client.rpc("receive_purchase_order", {
      p_purchase_order_id: po!.id,
      p_lines: [
        {
          purchase_order_line_id: poLine!.id,
          quantity: 12,
          destination_location_id: primaryA,
          destination_storage_area_id: fridgeArea,
          destination_bin_id: fridgeBin,
          lot_number: lotNumber,
          expiration_date: "2099-06-01",
        },
      ],
      p_notes: null,
      p_reference_text: null,
    });
    expect(receiveError).toBeNull();
    expect(receiptTxn?.id).toBeTruthy();

    const { data: createdLot } = await admin
      .from("inventory_lots")
      .select("id, expiration_date")
      .eq("organization_id", orgA)
      .eq("item_id", lotItemId)
      .eq("lot_number", lotNumber)
      .maybeSingle();
    expect(createdLot?.id).toBeTruthy();
    expect(createdLot?.expiration_date).toBe("2099-06-01");
    expect(await lotBalance(createdLot!.id)).toBe(12);

    const { data: countSession } = await client
      .from("count_sessions")
      .insert({
        organization_id: orgA,
        name: `Lot count ${Date.now()}`,
        status: "draft",
        blind_count_enabled: false,
      })
      .select("id")
      .single();
    await client.from("count_session_locations").insert({
      organization_id: orgA,
      count_session_id: countSession!.id,
      location_id: primaryA,
    });
    expect(
      (await client.rpc("start_count_session", { p_session_id: countSession!.id })).error,
    ).toBeNull();

    const { data: countLine } = await admin
      .from("count_lines")
      .select("id, expected_quantity, lot_id")
      .eq("count_session_id", countSession!.id)
      .eq("lot_id", createdLot!.id)
      .maybeSingle();
    expect(countLine?.lot_id).toBe(createdLot!.id);
    expect(Number(countLine?.expected_quantity)).toBe(12);

    const { data: allLines } = await admin
      .from("count_lines")
      .select("id, expected_quantity")
      .eq("count_session_id", countSession!.id);
    for (const line of allLines ?? []) {
      const counted =
        line.id === countLine!.id ? 10 : Number(line.expected_quantity);
      await client
        .from("count_lines")
        .update({ counted_quantity: counted, status: "counted" })
        .eq("id", line.id);
    }

    expect(
      (await client.rpc("submit_count_session_for_review", { p_session_id: countSession!.id })).error,
    ).toBeNull();
    for (const line of allLines ?? []) {
      expect(
        (
          await client.rpc("review_count_line", {
            p_line_id: line.id,
            p_decision: "accepted",
          })
        ).error,
      ).toBeNull();
    }
    expect(
      (
        await client.rpc("approve_count_session_reconciliation", {
          p_session_id: countSession!.id,
        })
      ).error,
    ).toBeNull();
    expect(await lotBalance(createdLot!.id)).toBe(10);
  });

  it("balance rebuild preserves lot quantities and expiration filters work", async () => {
    const { client } = await signIn("owner@nolt.local");
    const today = new Date();
    const expiredDate = new Date(today);
    expiredDate.setUTCDate(expiredDate.getUTCDate() - 2);
    const soonDate = new Date(today);
    soonDate.setUTCDate(soonDate.getUTCDate() + 20);
    const laterDate = new Date(today);
    laterDate.setUTCDate(laterDate.getUTCDate() + 80);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const { data: expiredLot } = await createLot(client, {
      lotNumber: `EXP-${Date.now()}`,
      expirationDate: iso(expiredDate),
    });
    const { data: soonLot } = await createLot(client, {
      lotNumber: `SOON-${Date.now()}`,
      expirationDate: iso(soonDate),
    });
    const { data: laterLot } = await createLot(client, {
      lotNumber: `LATER-${Date.now()}`,
      expirationDate: iso(laterDate),
    });

    for (const [lot, qty] of [
      [expiredLot!, 2],
      [soonLot!, 3],
      [laterLot!, 4],
    ] as const) {
      const { data: txn } = await createDraft(client, "receipt");
      await addLine(client, {
        transactionId: txn!.id,
        itemId: lotItemId,
        quantity: qty,
        lotId: lot.id,
        destLocationId: primaryA,
        destAreaId: fridgeArea,
        destBinId: fridgeBin,
      });
      expect(
        (
          await client.rpc("complete_inventory_transaction", {
            p_transaction_id: txn!.id,
          })
        ).error,
      ).toBeNull();
    }

    const beforeExpired = await lotBalance(expiredLot!.id);
    const beforeSoon = await lotBalance(soonLot!.id);
    expect(
      (await client.rpc("rebuild_inventory_balances", { p_organization_id: orgA })).error,
    ).toBeNull();
    expect(await lotBalance(expiredLot!.id)).toBe(beforeExpired);
    expect(await lotBalance(soonLot!.id)).toBe(beforeSoon);

    const { data: expiredRows } = await client
      .from("inventory_lots")
      .select("id")
      .eq("organization_id", orgA)
      .lt("expiration_date", iso(today));
    expect(expiredRows?.some((row) => row.id === expiredLot!.id)).toBe(true);

    const end30 = new Date(today);
    end30.setUTCDate(end30.getUTCDate() + 30);
    const { data: soonRows } = await client
      .from("inventory_lots")
      .select("id")
      .eq("organization_id", orgA)
      .gte("expiration_date", iso(today))
      .lte("expiration_date", iso(end30));
    expect(soonRows?.some((row) => row.id === soonLot!.id)).toBe(true);
    expect(soonRows?.some((row) => row.id === laterLot!.id)).toBe(false);
  });

  it("blocks tracking mode change after ledger activity", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { error } = await client
      .from("items")
      .update({ tracking_mode: "quantity" })
      .eq("id", lotItemId);
    expect(error?.message ?? "").toMatch(/tracking mode cannot change/i);
  });

  it("readonly can read lots but not manage", async () => {
    const { client: owner } = await signIn("owner@nolt.local");
    const { data: lot } = await createLot(owner, { lotNumber: `RO-${Date.now()}` });

    const { client: readonly } = await signIn("readonly@nolt.local");
    const { data: visible } = await readonly
      .from("inventory_lots")
      .select("id")
      .eq("id", lot!.id)
      .maybeSingle();
    expect(visible?.id).toBe(lot!.id);

    const { error } = await readonly
      .from("inventory_lots")
      .update({ notes: "nope" })
      .eq("id", lot!.id);
    expect(error).toBeTruthy();
  });
});
