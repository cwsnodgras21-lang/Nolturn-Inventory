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

describe.skipIf(!enabled)("Phase 3.2 purchasing RLS and receiving", () => {
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
  let mLUnit: string;

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

    if (!primaryA || !storageA || !primaryB || !alcoholId || !fridgeArea || !fridgeBin) {
      throw new Error("Bootstrap purchasing fixtures missing.");
    }
  });

  async function balanceQty() {
    const { data } = await admin
      .from("inventory_balances")
      .select("quantity_on_hand")
      .eq("organization_id", orgA)
      .eq("item_id", alcoholId)
      .eq("location_id", primaryA)
      .eq("storage_area_id", fridgeArea)
      .eq("bin_id", fridgeBin)
      .is("variant_id", null)
      .maybeSingle();
    return Number(data?.quantity_on_hand ?? 0);
  }

  async function createSupplier(client: SupabaseClient, orgId: string, name: string) {
    const { data, error } = await client
      .from("suppliers")
      .insert({
        organization_id: orgId,
        name,
        status: "active",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data!.id;
  }

  async function createDraftPo(
    client: SupabaseClient,
    opts: { supplierId: string; locationId?: string; qty?: number },
  ) {
    const { data: po, error } = await client
      .from("purchase_orders")
      .insert({
        organization_id: orgA,
        supplier_id: opts.supplierId,
        ship_to_location_id: opts.locationId ?? primaryA,
        order_date: new Date().toISOString().slice(0, 10),
        status: "draft",
        po_number: "",
      })
      .select("id, po_number, status")
      .single();
    expect(error).toBeNull();

    const { data: line, error: lineError } = await client
      .from("purchase_order_lines")
      .insert({
        organization_id: orgA,
        purchase_order_id: po!.id,
        line_number: 1,
        item_id: alcoholId,
        ordered_quantity: opts.qty ?? 100,
        purchase_unit_id: mLUnit,
        unit_cost: 1.25,
      })
      .select("id, conversion_multiplier, remaining_quantity")
      .single();
    expect(lineError).toBeNull();
    return { po: po!, line: line! };
  }

  it("isolates suppliers and purchase orders across tenants", async () => {
    const { client: ownerA } = await signIn("owner@nolt.local");
    const { client: ownerB } = await signIn("other-owner@nolt.local");
    const supplierA = await createSupplier(ownerA, orgA, `Supplier A ${Date.now()}`);
    const supplierB = await createSupplier(ownerB, orgB, `Supplier B ${Date.now()}`);

    const { data: visibleToA } = await ownerA.from("suppliers").select("id").eq("id", supplierB);
    expect(visibleToA ?? []).toHaveLength(0);

    const { data: poB, error: poBError } = await ownerB
      .from("purchase_orders")
      .insert({
        organization_id: orgB,
        supplier_id: supplierB,
        ship_to_location_id: primaryB,
        order_date: new Date().toISOString().slice(0, 10),
        status: "draft",
        po_number: "",
      })
      .select("id")
      .single();
    expect(poBError).toBeNull();

    const { data: cross } = await ownerA.from("purchase_orders").select("id").eq("id", poB!.id);
    expect(cross ?? []).toHaveLength(0);

    const { error: badLink } = await ownerA.from("purchase_orders").insert({
      organization_id: orgA,
      supplier_id: supplierB,
      ship_to_location_id: primaryA,
      order_date: new Date().toISOString().slice(0, 10),
      status: "draft",
      po_number: "",
    });
    expect(badLink).not.toBeNull();

    void supplierA;
  });

  it("enforces purchasing permissions for readonly and restricted users", async () => {
    const { client: owner } = await signIn("owner@nolt.local");
    const supplierId = await createSupplier(owner, orgA, `Perm Supplier ${Date.now()}`);
    const { po } = await createDraftPo(owner, { supplierId });

    const { client: readonly } = await signIn("readonly@nolt.local");
    const { data: readable } = await readonly.from("purchase_orders").select("id").eq("id", po.id);
    expect((readable ?? []).length).toBeGreaterThan(0);
    const { error: createDenied } = await readonly.from("suppliers").insert({
      organization_id: orgA,
      name: `Denied ${Date.now()}`,
      status: "active",
    });
    expect(createDenied).not.toBeNull();

    const { client: restricted } = await signIn("restricted@nolt.local");
    const { data: hidden } = await restricted
      .from("purchase_orders")
      .select("id")
      .eq("id", po.id);
    // restricted may or may not see PRIMARY depending on scopes; ensure no manage
    const { error: manageDenied } = await restricted.from("purchase_order_lines").insert({
      organization_id: orgA,
      purchase_order_id: po.id,
      line_number: 99,
      item_id: alcoholId,
      ordered_quantity: 1,
      purchase_unit_id: mLUnit,
    });
    expect(manageDenied).not.toBeNull();
    void hidden;
  });

  it("freezes conversion, supports partial then final receive, rejects over-receipt", async () => {
    const { client: owner } = await signIn("owner@nolt.local");
    const supplierId = await createSupplier(owner, orgA, `Recv Supplier ${Date.now()}`);
    const { po, line } = await createDraftPo(owner, { supplierId, qty: 50 });
    expect(Number(line.conversion_multiplier)).toBeGreaterThan(0);

    const submitted = await owner.rpc("submit_purchase_order", { p_purchase_order_id: po.id });
    expect(submitted.error).toBeNull();
    expect(submitted.data.status).toBe("submitted");

    const before = await balanceQty();
    const first = await owner.rpc("receive_purchase_order", {
      p_purchase_order_id: po.id,
      p_lines: [
        {
          purchase_order_line_id: line.id,
          quantity: 20,
          destination_location_id: primaryA,
          destination_storage_area_id: fridgeArea,
          destination_bin_id: fridgeBin,
        },
      ],
      p_notes: "partial",
      p_reference_text: "PACK-1",
    });
    expect(first.error).toBeNull();
    expect(first.data.transaction_type).toBe("receipt");
    expect(first.data.purchase_order_id).toBe(po.id);
    expect(first.data.status).toBe("completed");

    const { data: afterPartial } = await owner
      .from("purchase_orders")
      .select("status")
      .eq("id", po.id)
      .single();
    expect(afterPartial?.status).toBe("partially_received");

    const { data: linePartial } = await owner
      .from("purchase_order_lines")
      .select("received_quantity, remaining_quantity")
      .eq("id", line.id)
      .single();
    expect(Number(linePartial?.received_quantity)).toBe(20);
    expect(Number(linePartial?.remaining_quantity)).toBe(30);

    const mid = await balanceQty();
    expect(mid).toBeCloseTo(before + 20 * Number(line.conversion_multiplier), 5);

    const over = await owner.rpc("receive_purchase_order", {
      p_purchase_order_id: po.id,
      p_lines: [
        {
          purchase_order_line_id: line.id,
          quantity: 31,
          destination_location_id: primaryA,
          destination_storage_area_id: fridgeArea,
          destination_bin_id: fridgeBin,
        },
      ],
    });
    expect(over.error?.message).toMatch(/remaining quantity/i);

    const finalRecv = await owner.rpc("receive_purchase_order", {
      p_purchase_order_id: po.id,
      p_lines: [
        {
          purchase_order_line_id: line.id,
          quantity: 30,
          destination_location_id: primaryA,
          destination_storage_area_id: fridgeArea,
          destination_bin_id: fridgeBin,
        },
      ],
    });
    expect(finalRecv.error).toBeNull();

    const { data: afterFinal } = await owner
      .from("purchase_orders")
      .select("status")
      .eq("id", po.id)
      .single();
    expect(afterFinal?.status).toBe("received");

    const end = await balanceQty();
    expect(end).toBeCloseTo(before + 50 * Number(line.conversion_multiplier), 5);

    const closed = await owner.rpc("receive_purchase_order", {
      p_purchase_order_id: po.id,
      p_lines: [
        {
          purchase_order_line_id: line.id,
          quantity: 1,
          destination_location_id: primaryA,
          destination_storage_area_id: fridgeArea,
          destination_bin_id: fridgeBin,
        },
      ],
    });
    expect(closed.error).not.toBeNull();
  });

  it("rolls back multi-line receive when one line is invalid", async () => {
    const { client: owner } = await signIn("owner@nolt.local");
    const supplierId = await createSupplier(owner, orgA, `Rollback Supplier ${Date.now()}`);
    const { po, line } = await createDraftPo(owner, { supplierId, qty: 10 });

    const { data: line2 } = await owner
      .from("purchase_order_lines")
      .insert({
        organization_id: orgA,
        purchase_order_id: po.id,
        line_number: 2,
        item_id: alcoholId,
        ordered_quantity: 5,
        purchase_unit_id: mLUnit,
      })
      .select("id")
      .single();
    expect(line2).toBeTruthy();

    await owner.rpc("submit_purchase_order", { p_purchase_order_id: po.id });
    const before = await balanceQty();

    const failed = await owner.rpc("receive_purchase_order", {
      p_purchase_order_id: po.id,
      p_lines: [
        {
          purchase_order_line_id: line.id,
          quantity: 4,
          destination_location_id: primaryA,
          destination_storage_area_id: fridgeArea,
          destination_bin_id: fridgeBin,
        },
        {
          purchase_order_line_id: line2!.id,
          quantity: 99,
          destination_location_id: primaryA,
          destination_storage_area_id: fridgeArea,
          destination_bin_id: fridgeBin,
        },
      ],
    });
    expect(failed.error).not.toBeNull();

    const after = await balanceQty();
    expect(after).toBe(before);

    const { data: lines } = await owner
      .from("purchase_order_lines")
      .select("received_quantity")
      .eq("purchase_order_id", po.id);
    expect(lines?.every((row) => Number(row.received_quantity) === 0)).toBe(true);

    const { data: drafts } = await admin
      .from("inventory_transactions")
      .select("id, status")
      .eq("purchase_order_id", po.id);
    expect((drafts ?? []).every((row) => row.status !== "completed")).toBe(true);
  });

  it("writes audit-friendly receive link and prevents cancel after receipt", async () => {
    const { client: owner } = await signIn("owner@nolt.local");
    const supplierId = await createSupplier(owner, orgA, `Audit Supplier ${Date.now()}`);
    const { po, line } = await createDraftPo(owner, { supplierId, qty: 8 });
    await owner.rpc("submit_purchase_order", { p_purchase_order_id: po.id });
    const recv = await owner.rpc("receive_purchase_order", {
      p_purchase_order_id: po.id,
      p_lines: [
        {
          purchase_order_line_id: line.id,
          quantity: 8,
          destination_location_id: primaryA,
          destination_storage_area_id: fridgeArea,
          destination_bin_id: fridgeBin,
        },
      ],
    });
    expect(recv.error).toBeNull();

    const { data: txnLines } = await admin
      .from("inventory_transaction_lines")
      .select("purchase_order_line_id")
      .eq("transaction_id", recv.data.id);
    expect(txnLines?.[0]?.purchase_order_line_id).toBe(line.id);

    const cancel = await owner.rpc("cancel_purchase_order", { p_purchase_order_id: po.id });
    expect(cancel.error).not.toBeNull();
  });
});
