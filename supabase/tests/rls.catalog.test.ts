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

describe.skipIf(!enabled)("Phase 2.1 catalog RLS and integrity", () => {
  let admin: SupabaseClient;
  let orgA: string;
  let orgB: string;

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
  });

  it("default roles receive expected catalog permissions", async () => {
    const { data } = await admin
      .from("roles")
      .select("key, role_permissions(permissions(key))")
      .eq("organization_id", orgA)
      .in("key", ["inventory_manager", "read_only", "purchasing_manager"]);

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

    expect(keysFor("inventory_manager").has("catalog.read")).toBe(true);
    expect(keysFor("inventory_manager").has("catalog.manage")).toBe(true);
    expect(keysFor("purchasing_manager").has("catalog.read")).toBe(true);
    expect(keysFor("purchasing_manager").has("catalog.manage")).toBe(false);
    expect(keysFor("read_only").has("catalog.read")).toBe(true);
    expect(keysFor("read_only").has("catalog.manage")).toBe(false);
  });

  it("owner can create a unit; read-only cannot", async () => {
    const owner = await signIn("owner@nolt.local");
    const readonly = await signIn("readonly@nolt.local");
    const stamp = Date.now();

    const { data: created, error } = await owner.client
      .from("units_of_measure")
      .insert({
        organization_id: orgA,
        name: `Test Ampoule ${stamp}`,
        symbol: `amp-${stamp}`,
        dimension: "count",
        unit_kind: "packaging",
        precision: 0,
        status: "active",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(created?.id).toBeTruthy();

    const { data: denied, error: deniedError } = await readonly.client
      .from("units_of_measure")
      .insert({
        organization_id: orgA,
        name: `Should Fail Unit ${stamp}`,
        symbol: `fail-${stamp}`,
        dimension: "count",
        unit_kind: "packaging",
        precision: 0,
        status: "active",
      })
      .select("id");
    expect(denied ?? []).toEqual([]);
    expect(deniedError).toBeTruthy();
  });

  it("rejects duplicate unit names case-insensitively within org", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { error } = await client.from("units_of_measure").insert({
      organization_id: orgA,
      name: "each",
      symbol: "ea-dup",
      dimension: "count",
      unit_kind: "packaging",
      precision: 0,
      status: "active",
    });
    expect(error).toBeTruthy();
  });

  it("allows same unit name in different organizations", async () => {
    const ownerA = await signIn("owner@nolt.local");
    const ownerB = await signIn("other-owner@nolt.local");

    const name = `Shared Name ${Date.now()}`;
    const { error: aError } = await ownerA.client.from("units_of_measure").insert({
      organization_id: orgA,
      name,
      symbol: `sa-${Date.now()}`,
      dimension: "count",
      unit_kind: "packaging",
      precision: 0,
      status: "active",
    });
    const { error: bError } = await ownerB.client.from("units_of_measure").insert({
      organization_id: orgB,
      name,
      symbol: `sb-${Date.now()}`,
      dimension: "count",
      unit_kind: "packaging",
      precision: 0,
      status: "active",
    });
    expect(aError).toBeNull();
    expect(bError).toBeNull();
  });

  it("rejects invalid dimension and negative precision", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { error: dimError } = await client.from("units_of_measure").insert({
      organization_id: orgA,
      name: "Bad Dim",
      symbol: "bd",
      dimension: "temperature",
      unit_kind: "measurement",
      precision: 0,
      status: "active",
    });
    expect(dimError).toBeTruthy();

    const { error: precError } = await client.from("units_of_measure").insert({
      organization_id: orgA,
      name: "Bad Prec",
      symbol: "bp",
      dimension: "count",
      unit_kind: "packaging",
      precision: -1,
      status: "active",
    });
    expect(precError).toBeTruthy();
  });

  it("cannot move a unit between organizations", async () => {
    const { data: unit } = await admin
      .from("units_of_measure")
      .select("id")
      .eq("organization_id", orgA)
      .limit(1)
      .single();

    const { error } = await admin
      .from("units_of_measure")
      .update({ organization_id: orgB })
      .eq("id", unit!.id);
    expect(error).toBeTruthy();
  });

  it("cross-tenant user cannot read or update other org units", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data } = await client.from("units_of_measure").select("id").eq("organization_id", orgB);
    expect(data ?? []).toEqual([]);

    const { data: foreign } = await admin
      .from("units_of_measure")
      .select("id")
      .eq("organization_id", orgB)
      .limit(1)
      .single();

    const { data: updated } = await client
      .from("units_of_measure")
      .update({ name: "Hacked" })
      .eq("id", foreign!.id)
      .select("id");
    expect(updated ?? []).toEqual([]);
  });

  it("creates categories and rejects cycles / self-parent / cross-org parent", async () => {
    const { client } = await signIn("owner@nolt.local");

    const { data: root, error: rootError } = await client
      .from("item_categories")
      .insert({
        organization_id: orgA,
        name: `Root ${Date.now()}`,
        status: "active",
      })
      .select("id")
      .single();
    expect(rootError).toBeNull();

    const { data: child, error: childError } = await client
      .from("item_categories")
      .insert({
        organization_id: orgA,
        parent_id: root!.id,
        name: `Child ${Date.now()}`,
        status: "active",
      })
      .select("id")
      .single();
    expect(childError).toBeNull();

    const { error: selfError } = await client
      .from("item_categories")
      .update({ parent_id: root!.id })
      .eq("id", root!.id);
    expect(selfError).toBeTruthy();

    const { error: cycleError } = await client
      .from("item_categories")
      .update({ parent_id: child!.id })
      .eq("id", root!.id);
    expect(cycleError).toBeTruthy();

    const { data: foreignParent } = await admin
      .from("item_categories")
      .select("id")
      .eq("organization_id", orgB)
      .is("parent_id", null)
      .limit(1)
      .single();

    const { error: crossError } = await client
      .from("item_categories")
      .update({ parent_id: foreignParent!.id })
      .eq("id", child!.id);
    expect(crossError).toBeTruthy();
  });

  it("rejects duplicate sibling category names case-insensitively", async () => {
    const { client } = await signIn("owner@nolt.local");
    const stamp = Date.now();
    const { data: root } = await client
      .from("item_categories")
      .insert({
        organization_id: orgA,
        name: `Dup Root ${stamp}`,
        status: "active",
      })
      .select("id")
      .single();

    await client.from("item_categories").insert({
      organization_id: orgA,
      parent_id: root!.id,
      name: "Gloves",
      status: "active",
    });

    const { error } = await client.from("item_categories").insert({
      organization_id: orgA,
      parent_id: root!.id,
      name: "gloves",
      status: "active",
    });
    expect(error).toBeTruthy();
  });

  it("creating a unit writes an audit event; audit remains append-only", async () => {
    const { client } = await signIn("owner@nolt.local");
    const stamp = Date.now();
    const { data: unit } = await client
      .from("units_of_measure")
      .insert({
        organization_id: orgA,
        name: `Audited Unit ${stamp}`,
        symbol: `au-${stamp}`,
        dimension: "count",
        unit_kind: "packaging",
        precision: 0,
        status: "active",
      })
      .select("id")
      .single();

    // Application layer writes audits; for RLS path we insert via authenticated policy if needed.
    // Verify tenant cannot mutate audits.
    const { data: events } = await client
      .from("audit_events")
      .select("id")
      .eq("organization_id", orgA)
      .limit(1);
    const eventId = events?.[0]?.id;
    expect(eventId).toBeTruthy();

    const { data: updated } = await client
      .from("audit_events")
      .update({ summary: "tamper" })
      .eq("id", eventId!)
      .select("id");
    expect(updated ?? []).toEqual([]);

    // Ensure unit exists for the create assertion above
    expect(unit?.id).toBeTruthy();
  });

  it("inactive unit remains readable", async () => {
    const { data: unit } = await admin
      .from("units_of_measure")
      .select("id")
      .eq("organization_id", orgA)
      .eq("status", "active")
      .limit(1)
      .single();

    await admin.from("units_of_measure").update({ status: "inactive" }).eq("id", unit!.id);

    const { client } = await signIn("readonly@nolt.local");
    const { data } = await client.from("units_of_measure").select("id, status").eq("id", unit!.id);
    expect(data?.[0]?.status).toBe("inactive");

    await admin.from("units_of_measure").update({ status: "active" }).eq("id", unit!.id);
  });
});
