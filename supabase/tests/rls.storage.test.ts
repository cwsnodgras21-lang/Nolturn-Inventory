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

describe.skipIf(!enabled)("Phase 2.3 storage RLS and integrity", () => {
  let admin: SupabaseClient;
  let orgA: string;
  let orgB: string;
  let primaryA: string;
  let storageA: string;
  let primaryB: string;

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

    const { data: locsA } = await admin
      .from("locations")
      .select("id, code")
      .eq("organization_id", orgA);
    primaryA = locsA?.find((l) => l.code === "PRIMARY")?.id ?? "";
    storageA = locsA?.find((l) => l.code === "STORAGE")?.id ?? "";

    const { data: locsB } = await admin
      .from("locations")
      .select("id, code")
      .eq("organization_id", orgB);
    primaryB = locsB?.find((l) => l.code === "PRIMARY")?.id ?? "";

    if (!primaryA || !storageA || !primaryB) {
      throw new Error("Bootstrap locations missing.");
    }
  });

  it("default roles receive expected storage permissions", async () => {
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

    expect(keysFor("inventory_manager").has("inventory.storage.read")).toBe(true);
    expect(keysFor("inventory_manager").has("inventory.storage.manage")).toBe(true);
    expect(keysFor("location_manager").has("inventory.storage.manage")).toBe(true);
    expect(keysFor("purchasing_manager").has("inventory.storage.read")).toBe(true);
    expect(keysFor("purchasing_manager").has("inventory.storage.manage")).toBe(false);
    expect(keysFor("staff").has("inventory.storage.read")).toBe(true);
    expect(keysFor("staff").has("inventory.storage.manage")).toBe(false);
    expect(keysFor("read_only").has("inventory.storage.read")).toBe(true);
    expect(keysFor("read_only").has("inventory.storage.manage")).toBe(false);
  });

  it("blocks cross-tenant storage reads", async () => {
    const ownerA = await signIn("owner@nolt.local");
    const ownerB = await signIn("other-owner@nolt.local");
    const { data: area } = await ownerA.client
      .from("storage_areas")
      .select("id")
      .eq("location_id", primaryA)
      .eq("code", "SUPPLY")
      .maybeSingle();
    expect(area?.id).toBeTruthy();

    const { data } = await ownerB.client.from("storage_areas").select("id").eq("id", area!.id);
    expect(data ?? []).toEqual([]);
  });

  it("restricted user only sees storage in allowed locations", async () => {
    const restricted = await signIn("restricted@nolt.local");
    const { data } = await restricted.client
      .from("storage_areas")
      .select("id, location_id, code")
      .eq("organization_id", orgA);

    const locationIds = new Set((data ?? []).map((row) => row.location_id));
    expect(locationIds.has(primaryA)).toBe(true);
    expect(locationIds.has(storageA)).toBe(false);
    expect((data ?? []).some((row) => row.code === "WH-MAIN")).toBe(false);
    expect((data ?? []).some((row) => row.code === "SUPPLY")).toBe(true);
  });

  it("restricted user cannot manage storage in unauthorized locations", async () => {
    const restricted = await signIn("restricted@nolt.local");
    const stamp = Date.now();
    const { error } = await restricted.client.from("storage_areas").insert({
      organization_id: orgA,
      location_id: storageA,
      name: `Unauthorized ${stamp}`,
      code: `UNAUTH-${stamp}`,
      area_type: "room",
      status: "active",
    });
    expect(error).toBeTruthy();
  });

  it("read-only users cannot mutate storage", async () => {
    const readonly = await signIn("readonly@nolt.local");
    const { error } = await readonly.client.from("storage_areas").insert({
      organization_id: orgA,
      location_id: primaryA,
      name: `RO Area ${Date.now()}`,
      area_type: "room",
      status: "active",
    });
    expect(error).toBeTruthy();
  });

  it("rejects self-parent, cycles, and cross-location parents", async () => {
    const { client } = await signIn("owner@nolt.local");
    const stamp = Date.now();

    const { data: root } = await client
      .from("storage_areas")
      .insert({
        organization_id: orgA,
        location_id: primaryA,
        name: `Root ${stamp}`,
        code: `ROOT-${stamp}`,
        area_type: "room",
        status: "active",
      })
      .select("id")
      .single();
    expect(root?.id).toBeTruthy();

    const { data: child } = await client
      .from("storage_areas")
      .insert({
        organization_id: orgA,
        location_id: primaryA,
        parent_id: root!.id,
        name: `Child ${stamp}`,
        code: `CHILD-${stamp}`,
        area_type: "cabinet",
        status: "active",
      })
      .select("id")
      .single();
    expect(child?.id).toBeTruthy();

    const { error: selfParent } = await client
      .from("storage_areas")
      .update({ parent_id: root!.id })
      .eq("id", root!.id)
      .select("id");
    // Constraint/trigger should reject; update returns error or empty
    expect(selfParent).toBeTruthy();

    const { error: cycle } = await client
      .from("storage_areas")
      .update({ parent_id: child!.id })
      .eq("id", root!.id);
    expect(cycle).toBeTruthy();

    const { data: otherLocArea } = await admin
      .from("storage_areas")
      .select("id")
      .eq("location_id", storageA)
      .limit(1)
      .maybeSingle();

    if (otherLocArea?.id) {
      const { error: crossLoc } = await client
        .from("storage_areas")
        .update({ parent_id: otherLocArea.id })
        .eq("id", child!.id);
      expect(crossLoc).toBeTruthy();
    }
  });

  it("rejects duplicate area codes within a location", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { error } = await client.from("storage_areas").insert({
      organization_id: orgA,
      location_id: primaryA,
      name: "Supply Room Duplicate",
      code: "supply",
      area_type: "room",
      status: "active",
    });
    expect(error).toBeTruthy();
  });

  it("bin must match area organization; duplicate bin codes rejected", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data: fridge } = await client
      .from("storage_areas")
      .select("id")
      .eq("location_id", primaryA)
      .eq("code", "MED-FRIDGE")
      .maybeSingle();
    expect(fridge?.id).toBeTruthy();

    const stamp = Date.now();
    const { data: bin, error } = await client
      .from("storage_bins")
      .insert({
        organization_id: orgA,
        storage_area_id: fridge!.id,
        name: `Temp Bin ${stamp}`,
        code: `TEMP-BIN-${stamp}`,
        status: "active",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(bin?.id).toBeTruthy();

    const { error: dup } = await client.from("storage_bins").insert({
      organization_id: orgA,
      storage_area_id: fridge!.id,
      name: `Temp Bin Dup ${stamp}`,
      code: `temp-bin-${stamp}`,
      status: "active",
    });
    expect(dup).toBeTruthy();

    const { error: crossOrg } = await client.from("storage_bins").insert({
      organization_id: orgB,
      storage_area_id: fridge!.id,
      name: `Bad Org Bin ${stamp}`,
      status: "active",
    });
    expect(crossOrg).toBeTruthy();
  });

  it("organization switching does not leak storage across tenants", async () => {
    const multi = await signIn("multi@nolt.local");
    const { data: inA } = await multi.client
      .from("storage_areas")
      .select("id, organization_id")
      .eq("organization_id", orgA);
    const { data: inB } = await multi.client
      .from("storage_areas")
      .select("id, organization_id")
      .eq("organization_id", orgB);

    expect((inA ?? []).every((row) => row.organization_id === orgA)).toBe(true);
    expect((inB ?? []).every((row) => row.organization_id === orgB)).toBe(true);
    expect((inA ?? []).length).toBeGreaterThan(0);
    expect((inB ?? []).length).toBeGreaterThan(0);
  });

  it("creating a storage area is auditable via application actions path readiness", async () => {
    // DB path: owner can insert; audit writer is app-layer. Verify insert succeeds and audits immutable.
    const { client } = await signIn("owner@nolt.local");
    const stamp = Date.now();
    const { data: area, error } = await client
      .from("storage_areas")
      .insert({
        organization_id: orgA,
        location_id: primaryA,
        name: `Audited Area ${stamp}`,
        code: `AUD-${stamp}`,
        area_type: "closet",
        status: "active",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(area?.id).toBeTruthy();

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
  });
});
