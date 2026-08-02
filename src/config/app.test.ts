import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PERMISSION_KEYS } from "@/lib/permissions/catalog";
import { sanitizeAuditMetadata } from "@/modules/audit/actions";
import { appConfig, administrationNav, platformNav } from "@/config/app";

describe("permission catalog sync", () => {
  it("matches seeded permission keys across migrations", () => {
    const migrationsDir = path.join(process.cwd(), "supabase/migrations");
    const sql = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
      .join("\n");

    for (const key of PERMISSION_KEYS) {
      expect(sql).toContain(`('${key}'`);
    }

    const seeded = [...sql.matchAll(/\('([a-z]+(?:\.[a-z_]+)+)',\s*'/g)].map((m) => m[1]);
    const unique = [...new Set(seeded)];
    expect(unique.sort()).toEqual([...PERMISSION_KEYS].sort());
  });
});

describe("service-role isolation", () => {
  it("marks service-role module as server-only", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/supabase/service-role.ts"),
      "utf8",
    );
    expect(source).toContain('import "server-only"');
    expect(source).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE");
  });

  it("does not import service-role from client entrypoints", () => {
    const browser = readFileSync(
      path.join(process.cwd(), "src/lib/supabase/browser.ts"),
      "utf8",
    );
    expect(browser).not.toContain("service-role");
    expect(browser).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});

describe("audit metadata sanitization", () => {
  it("strips secret-like keys", () => {
    const cleaned = sanitizeAuditMetadata({
      organizationId: "abc",
      password: "nope",
      access_token: "nope",
      note: "ok",
    });
    expect(cleaned).toEqual({ organizationId: "abc", note: "ok" });
  });
});

describe("appConfig phase 3.3", () => {
  it("reports phase 3.3 and enables purchasing nav", () => {
    expect(appConfig.phase).toBe(3.3);
    const inventory = platformNav.find((item) => item.href === "/inventory");
    expect(inventory?.status).toBe("available");
    const purchasing = platformNav.find((item) => item.href === "/purchasing");
    expect(purchasing?.status).toBe("available");
    const storage = administrationNav.find((item) => item.href === "/administration/storage");
    expect(storage?.status).toBe("available");
  });
});
