import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
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
  return {
    client: createClient(url!, anon!, {
      global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    userId: data.user.id,
  };
}

describe.skipIf(!enabled)("RLS onboarding / invitations / modules", () => {
  let admin: SupabaseClient;
  let orgA: string;
  let orgB: string;
  let roleStaffA: string;
  let locationA: string;

  beforeAll(async () => {
    admin = createClient(url!, service!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: orgs } = await admin.from("organizations").select("id, slug");
    orgA = orgs?.find((o) => o.slug.startsWith("north-clinic"))?.id ?? "";
    orgB = orgs?.find((o) => o.slug.startsWith("south-wellness"))?.id ?? "";
    if (!orgA || !orgB) throw new Error("Bootstrap orgs missing");

    const { data: roles } = await admin
      .from("roles")
      .select("id, key")
      .eq("organization_id", orgA);
    roleStaffA = roles?.find((r) => r.key === "staff")?.id ?? "";

    const { data: locs } = await admin
      .from("locations")
      .select("id, code")
      .eq("organization_id", orgA);
    locationA = locs?.find((l) => l.code === "PRIMARY")?.id ?? "";
  });

  it("bootstrapped orgs have completed onboarding and enabled modules", async () => {
    const { data: onboarding } = await admin
      .from("organization_onboarding")
      .select("status, starter_pack")
      .eq("organization_id", orgA)
      .single();
    expect(onboarding?.status).toBe("completed");

    const { data: modules } = await admin
      .from("organization_modules")
      .select("module_id, status")
      .eq("organization_id", orgA);
    expect((modules ?? []).length).toBeGreaterThanOrEqual(6);
    expect((modules ?? []).every((m) => m.status === "enabled")).toBe(true);
  });

  it("org A owner cannot read org B onboarding state", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data } = await client
      .from("organization_onboarding")
      .select("organization_id")
      .eq("organization_id", orgB);
    expect(data ?? []).toEqual([]);
  });

  it("org A owner cannot update org B modules", async () => {
    const { client } = await signIn("owner@nolt.local");
    const { data } = await client
      .from("organization_modules")
      .update({ status: "disabled" })
      .eq("organization_id", orgB)
      .eq("module_id", "core.alerts")
      .select("id");
    expect(data ?? []).toEqual([]);
  });

  it("blocks duplicate pending invitations for the same email", async () => {
    const { client } = await signIn("owner@nolt.local");
    const email = `dup-invite-${Date.now()}@example.com`;
    const tokenHash = createHash("sha256").update(randomBytes(16)).digest("hex");
    const expires = new Date(Date.now() + 86400000).toISOString();

    const first = await client
      .from("organization_invitations")
      .insert({
        organization_id: orgA,
        email,
        role_id: roleStaffA,
        token_hash: tokenHash,
        expires_at: expires,
      })
      .select("id")
      .single();
    expect(first.error).toBeNull();

    const second = await client
      .from("organization_invitations")
      .insert({
        organization_id: orgA,
        email,
        role_id: roleStaffA,
        token_hash: createHash("sha256").update(randomBytes(16)).digest("hex"),
        expires_at: expires,
      })
      .select("id")
      .single();
    expect(second.error).not.toBeNull();
  });

  it("read-only member cannot create invitations", async () => {
    const { client } = await signIn("readonly@nolt.local");
    const { data, error } = await client
      .from("organization_invitations")
      .insert({
        organization_id: orgA,
        email: `ro-${Date.now()}@example.com`,
        role_id: roleStaffA,
        token_hash: createHash("sha256").update(randomBytes(16)).digest("hex"),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .select("id");
    expect(data ?? []).toEqual([]);
    expect(error).toBeTruthy();
  });

  it("restricted user cannot invite for inaccessible org", async () => {
    const { client } = await signIn("restricted@nolt.local");
    const { data } = await client
      .from("organization_invitations")
      .insert({
        organization_id: orgB,
        email: `x-${Date.now()}@example.com`,
        role_id: roleStaffA,
        token_hash: createHash("sha256").update(randomBytes(16)).digest("hex"),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .select("id");
    expect(data ?? []).toEqual([]);
  });

  it("accept invitation enforces email match and grants membership", async () => {
    const inviteEmail = `invitee-${Date.now()}@nolt.local`;
    const password = "password123";
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: inviteEmail,
      password,
      email_confirm: true,
    });
    expect(createError).toBeNull();
    expect(created.user).toBeTruthy();

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { data: invitation, error: invError } = await admin
      .from("organization_invitations")
      .insert({
        organization_id: orgA,
        email: inviteEmail,
        role_id: roleStaffA,
        location_access_mode: "restricted",
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .select("id")
      .single();
    expect(invError).toBeNull();

    await admin.from("organization_invitation_location_scopes").insert({
      invitation_id: invitation!.id,
      organization_id: orgA,
      location_id: locationA,
    });

    const wrongUser = await signIn("owner@nolt.local");
    const wrong = await wrongUser.client.rpc("accept_organization_invitation", {
      p_token: token,
    });
    expect(wrong.error).toBeTruthy();

    const invitee = await signIn(inviteEmail);
    const accepted = await invitee.client.rpc("accept_organization_invitation", {
      p_token: token,
    });
    expect(accepted.error).toBeNull();
    expect(accepted.data).toBe(orgA);

    const { data: membership } = await admin
      .from("organization_memberships")
      .select("id, location_access_mode, status")
      .eq("organization_id", orgA)
      .eq("user_id", invitee.userId)
      .single();
    expect(membership?.status).toBe("active");
    expect(membership?.location_access_mode).toBe("restricted");

    const { data: scopes } = await admin
      .from("membership_location_scopes")
      .select("location_id")
      .eq("membership_id", membership!.id);
    expect(scopes?.map((s) => s.location_id)).toContain(locationA);
  });

  it("completing onboarding requires required steps (DB consistency)", async () => {
    const { data: orgId, error } = await admin.rpc("provision_organization", {
      p_name: `Onboard Test ${Date.now()}`,
      p_timezone: "America/Chicago",
      p_create_default_location: true,
    });
    // service role has no auth.uid — expect failure; create org row + onboarding manually
    expect(error).toBeTruthy();
    void orgId;

    const { data: ownerSession } = await admin.auth.signInWithPassword({
      email: "other-owner@nolt.local",
      password: "password123",
    });
    const ownerClient = createClient(url!, anon!, {
      global: {
        headers: { Authorization: `Bearer ${ownerSession!.session!.access_token}` },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: newOrgId, error: provisionError } = await ownerClient.rpc(
      "provision_organization",
      {
        p_name: `Fresh Tenant ${Date.now()}`,
        p_timezone: "America/Chicago",
        p_create_default_location: true,
      },
    );
    expect(provisionError).toBeNull();
    expect(newOrgId).toBeTruthy();

    const { data: onboarding } = await ownerClient
      .from("organization_onboarding")
      .select("*")
      .eq("organization_id", newOrgId)
      .single();
    expect(onboarding?.status).toBe("in_progress");
    expect(onboarding?.details_completed_at).toBeNull();

    expect(onboarding?.current_step).toBe("details");

    const blocked = await ownerClient
      .from("organization_onboarding")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("organization_id", newOrgId)
      .select("status");
    expect(blocked.error).toBeTruthy();

    // Mark required steps then complete
    const { error: progressError } = await ownerClient
      .from("organization_onboarding")
      .update({
        details_completed_at: new Date().toISOString(),
        location_completed_at: new Date().toISOString(),
        starter_completed_at: new Date().toISOString(),
        modules_completed_at: new Date().toISOString(),
        starter_pack: "blank",
        invite_skipped: true,
        catalog_skipped: true,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("organization_id", newOrgId);
    expect(progressError).toBeNull();
  });

  it("logo storage path is tenant-scoped via RLS", async () => {
    const { client } = await signIn("owner@nolt.local");
    const pathB = `${orgB}/logo.png`;
    const { error } = await client.storage
      .from("org-logos")
      .upload(pathB, new Uint8Array([137, 80, 78, 71]), {
        contentType: "image/png",
        upsert: true,
      });
    expect(error).toBeTruthy();
  });
});
