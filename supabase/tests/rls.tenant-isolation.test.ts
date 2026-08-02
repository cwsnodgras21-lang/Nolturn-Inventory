import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

const enabled = Boolean(url && anon && service && process.env.RUN_RLS_TESTS === "1");

function clientAs(accessToken?: string) {
  return createClient(url!, anon!, {
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signIn(email: string, password = "password123") {
  const client = createClient(url!, anon!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error("no session");
  return { client, accessToken: data.session.access_token, userId: data.user.id };
}

describe.skipIf(!enabled)("RLS tenant isolation", () => {
  let admin: SupabaseClient;
  let orgA: string;
  let orgB: string;
  let primaryLocationA: string;
  let storageLocationA: string;

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

    const { data: locs } = await admin
      .from("locations")
      .select("id, code, organization_id")
      .eq("organization_id", orgA);
    primaryLocationA = locs?.find((l) => l.code === "PRIMARY")?.id ?? "";
    storageLocationA = locs?.find((l) => l.code === "STORAGE")?.id ?? "";
  });

  afterAll(async () => {
    // no-op
  });

  it("anonymous cannot read organizations", async () => {
    const anonClient = clientAs();
    const { data, error } = await anonClient.from("organizations").select("id");
    // Either no GRANT (permission denied) or RLS empty set is acceptable denial.
    expect((data ?? []).length).toBe(0);
    if (error) {
      expect(["42501", "PGRST301"]).toContain(error.code);
    }
  });

  it("org A owner cannot select org B", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data } = await client.from("organizations").select("id").eq("id", orgB);
    expect(data ?? []).toEqual([]);
  });

  it("org A owner cannot update org B", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data, error } = await client
      .from("organizations")
      .update({ name: "Hacked" })
      .eq("id", orgB)
      .select("id");
    expect(data ?? []).toEqual([]);
    expect(error).toBeNull();
  });

  it("org A owner cannot insert membership into org B", async () => {
    const { client, userId } = await signIn("owner@nolt.local");
    const { data, error } = await client
      .from("organization_memberships")
      .insert({
        organization_id: orgB,
        user_id: userId,
        status: "active",
      })
      .select("id");
    expect(data ?? []).toEqual([]);
    expect(error).toBeTruthy();
  });

  it("multi-org user can read both authorized organizations", async () => {
    const { client } = await signIn("multi@nolt.local");
    const { data } = await client.from("organizations").select("id");
    const ids = (data ?? []).map((row) => row.id).sort();
    expect(ids).toEqual([orgA, orgB].sort());
  });

  it("read-only user cannot create locations", async () => {
    const { client } = await signIn("readonly@nolt.local");
    const { data, error } = await client
      .from("locations")
      .insert({
        organization_id: orgA,
        name: "Should Fail",
        code: "FAIL",
        status: "active",
      })
      .select("id");
    expect(data ?? []).toEqual([]);
    expect(error).toBeTruthy();
  });

  it("restricted user can read assigned location only", async () => {
    const { client } = await signIn("restricted@nolt.local");
    const { data } = await client.from("locations").select("id").eq("organization_id", orgA);
    const ids = (data ?? []).map((row) => row.id);
    expect(ids).toContain(primaryLocationA);
    expect(ids).not.toContain(storageLocationA);
  });

  it("tenant cannot update or delete audit events", async () => {
    const { client } = await signIn("owner@nolt.local");
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

    const { data: deleted } = await client
      .from("audit_events")
      .delete()
      .eq("id", eventId!)
      .select("id");
    expect(deleted ?? []).toEqual([]);
  });

  it("owner cannot view other organization audit events", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data } = await client.from("audit_events").select("id").eq("organization_id", orgB);
    expect(data ?? []).toEqual([]);
  });

  it("membership_roles rejects cross-org role assignment at DB layer", async () => {
    const { data: membership } = await admin
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", orgA)
      .eq("user_id", (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === "readonly@nolt.local")!.id)
      .single();

    const { data: foreignRole } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", orgB)
      .eq("key", "staff")
      .single();

    const { error } = await admin.from("membership_roles").insert({
      membership_id: membership!.id,
      role_id: foreignRole!.id,
    });
    expect(error).toBeTruthy();
  });
});
