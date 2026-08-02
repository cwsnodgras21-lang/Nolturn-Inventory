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

describe.skipIf(!enabled)("Phase 2.2 items RLS and integrity", () => {
  let admin: SupabaseClient;
  let orgA: string;
  let orgB: string;
  let eaA: string;
  let boxA: string;
  let eaB: string;
  let categoryA: string;

  beforeAll(async () => {
    admin = createClient(url!, service!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: orgs } = await admin.from("organizations").select("id, slug");
    orgA = orgs?.find((o) => o.slug.startsWith("north-clinic"))?.id ?? "";
    orgB = orgs?.find((o) => o.slug.startsWith("south-wellness"))?.id ?? "";
    if (!orgA || !orgB) {
      throw new Error("Bootstrap orgs missing. Run npm run db:bootstrap first.");
    }

    const { data: unitsA } = await admin
      .from("units_of_measure")
      .select("id, symbol")
      .eq("organization_id", orgA);
    eaA = unitsA?.find((u) => u.symbol === "ea")?.id ?? "";
    boxA = unitsA?.find((u) => u.symbol === "box")?.id ?? "";

    const { data: unitsB } = await admin
      .from("units_of_measure")
      .select("id, symbol")
      .eq("organization_id", orgB);
    eaB = unitsB?.find((u) => u.symbol === "ea")?.id ?? "";

    const { data: categories } = await admin
      .from("item_categories")
      .select("id")
      .eq("organization_id", orgA)
      .eq("name", "PPE")
      .maybeSingle();
    categoryA = categories?.id ?? "";

    if (!eaA || !boxA || !eaB) {
      throw new Error("Bootstrap units missing.");
    }
  });

  async function createItem(
    client: SupabaseClient,
    orgId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const stamp = Date.now();
    return client
      .from("items")
      .insert({
        organization_id: orgId,
        name: `Test Item ${stamp}`,
        sku: `SKU-${stamp}`,
        base_unit_id: orgId === orgA ? eaA : eaB,
        default_entry_unit_id: orgId === orgA ? eaA : eaB,
        status: "active",
        ...overrides,
      })
      .select("id")
      .single();
  }

  it("blocks cross-tenant item reads", async () => {
    const ownerA = await signIn("owner@nolt.local");
    const ownerB = await signIn("other-owner@nolt.local");
    const { data: item } = await createItem(ownerA.client, orgA);
    expect(item?.id).toBeTruthy();

    const { data } = await ownerB.client.from("items").select("id").eq("id", item!.id);
    expect(data ?? []).toEqual([]);
  });

  it("rejects category or unit from another organization", async () => {
    const { client } = await signIn("owner@nolt.local");
    const stamp = Date.now();

    const { error: unitError } = await client.from("items").insert({
      organization_id: orgA,
      name: `Cross Unit ${stamp}`,
      sku: `XU-${stamp}`,
      base_unit_id: eaB,
      default_entry_unit_id: eaB,
      status: "active",
    });
    expect(unitError).toBeTruthy();

    if (categoryA) {
      const ownerB = await signIn("other-owner@nolt.local");
      const { error: catError } = await ownerB.client.from("items").insert({
        organization_id: orgB,
        name: `Cross Cat ${stamp}`,
        sku: `XC-${stamp}`,
        category_id: categoryA,
        base_unit_id: eaB,
        default_entry_unit_id: eaB,
        status: "active",
      });
      expect(catError).toBeTruthy();
    }
  });

  it("enforces SKU uniqueness within an organization", async () => {
    const { client } = await signIn("owner@nolt.local");
    const stamp = Date.now();
    const sku = `DUP-${stamp}`;
    const first = await createItem(client, orgA, { sku });
    expect(first.error).toBeNull();

    const second = await createItem(client, orgA, { sku: sku.toLowerCase() });
    expect(second.error).toBeTruthy();
  });

  it("read-only users cannot mutate items", async () => {
    const readonly = await signIn("readonly@nolt.local");
    const { error } = await createItem(readonly.client, orgA);
    expect(error).toBeTruthy();
  });

  it("supports variants with item/org integrity", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data: item } = await createItem(client, orgA);
    const { data: variant, error } = await client
      .from("item_variants")
      .insert({
        organization_id: orgA,
        item_id: item!.id,
        name: "Medium",
        sku: `VAR-${Date.now()}`,
        status: "active",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(variant?.id).toBeTruthy();

    const { error: crossOrg } = await client.from("item_variants").insert({
      organization_id: orgB,
      item_id: item!.id,
      name: "Large",
      status: "active",
    });
    expect(crossOrg).toBeTruthy();
  });

  it("conversion must target base unit with positive multiplier", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data: item } = await createItem(client, orgA, {
      base_unit_id: eaA,
      default_entry_unit_id: eaA,
    });

    const { error: badTarget } = await client.from("item_unit_conversions").insert({
      organization_id: orgA,
      item_id: item!.id,
      from_unit_id: eaA,
      to_unit_id: boxA,
      multiplier: 100,
    });
    expect(badTarget).toBeTruthy();

    const { error: badMultiplier } = await client.from("item_unit_conversions").insert({
      organization_id: orgA,
      item_id: item!.id,
      from_unit_id: boxA,
      to_unit_id: eaA,
      multiplier: 0,
    });
    expect(badMultiplier).toBeTruthy();

    const { error: ok } = await client.from("item_unit_conversions").insert({
      organization_id: orgA,
      item_id: item!.id,
      from_unit_id: boxA,
      to_unit_id: eaA,
      multiplier: 100,
    });
    expect(ok).toBeNull();

    const { error: dup } = await client.from("item_unit_conversions").insert({
      organization_id: orgA,
      item_id: item!.id,
      from_unit_id: boxA,
      to_unit_id: eaA,
      multiplier: 50,
    });
    expect(dup).toBeTruthy();
  });

  it("identifier uniqueness and variant must belong to item", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data: item } = await createItem(client, orgA);
    const { data: other } = await createItem(client, orgA);
    const { data: variant } = await client
      .from("item_variants")
      .insert({
        organization_id: orgA,
        item_id: other!.id,
        name: "OnlyOnOther",
        status: "active",
      })
      .select("id")
      .single();

    const value = `BC-${Date.now()}`;
    const { error: first } = await client.from("item_identifiers").insert({
      organization_id: orgA,
      item_id: item!.id,
      identifier_type: "barcode",
      value_display: value,
      is_primary: true,
    });
    expect(first).toBeNull();

    const { error: dup } = await client.from("item_identifiers").insert({
      organization_id: orgA,
      item_id: other!.id,
      identifier_type: "barcode",
      value_display: ` ${value.toUpperCase()} `,
      is_primary: true,
    });
    expect(dup).toBeTruthy();

    const { error: badVariant } = await client.from("item_identifiers").insert({
      organization_id: orgA,
      item_id: item!.id,
      variant_id: variant!.id,
      identifier_type: "internal_code",
      value_display: `INT-${Date.now()}`,
      is_primary: false,
    });
    expect(badVariant).toBeTruthy();
  });

  it("bootstrap sample items exist and org switch does not leak", async () => {
    const ownerA = await signIn("owner@nolt.local");
    const ownerB = await signIn("other-owner@nolt.local");

    const { data: glovesA } = await ownerA.client
      .from("items")
      .select("id, sku")
      .eq("sku", "PPE-GLOVE-NIT");
    expect((glovesA ?? []).length).toBeGreaterThan(0);

    const gloveId = glovesA?.[0]?.id;
    expect(gloveId).toBeTruthy();

    const { data: leaked } = await ownerB.client.from("items").select("id").eq("id", gloveId!);
    expect(leaked ?? []).toEqual([]);

    const { data: glovesB } = await ownerB.client
      .from("items")
      .select("id")
      .eq("sku", "PPE-GLOVE-NIT");
    expect((glovesB ?? []).length).toBeGreaterThan(0);
    expect(glovesB?.[0]?.id).not.toBe(gloveId);
  });
});
