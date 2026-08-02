/**
 * Local development bootstrap — creates Auth users and demo tenancy via service role.
 * Usage: npm run db:bootstrap
 * Requires local Supabase running and .env.local populated from `supabase status`.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type SeedUser = {
  email: string;
  password: string;
  displayName: string;
};

const users: SeedUser[] = [
  { email: "owner@nolt.local", password: "password123", displayName: "Org Owner" },
  { email: "admin@nolt.local", password: "password123", displayName: "Org Admin" },
  { email: "multi@nolt.local", password: "password123", displayName: "Multi Org User" },
  { email: "restricted@nolt.local", password: "password123", displayName: "Location Manager" },
  { email: "readonly@nolt.local", password: "password123", displayName: "Read Only" },
  { email: "other-owner@nolt.local", password: "password123", displayName: "Other Owner" },
];

async function ensureUser(user: SeedUser): Promise<string> {
  const existing = await admin.auth.admin.listUsers({ perPage: 200 });
  const found = existing.data.users.find((u) => u.email === user.email);
  if (found) return found.id;

  const created = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { display_name: user.displayName },
  });

  if (created.error || !created.data.user) {
    throw created.error ?? new Error(`Failed to create ${user.email}`);
  }
  return created.data.user.id;
}

async function provisionAsUser(email: string, password: string, orgName: string) {
  const userClient = createClient(url!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: signInError } = await userClient.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const { data: orgId, error } = await userClient.rpc("provision_organization", {
    p_name: orgName,
    p_timezone: "America/Chicago",
    p_create_default_location: true,
  });
  if (error || !orgId) throw error ?? new Error("provision failed");
  await userClient.auth.signOut();
  return orgId as string;
}

async function main() {
  console.log("Creating auth users…");
  const ids: Record<string, string> = {};
  for (const user of users) {
    ids[user.email] = await ensureUser(user);
    console.log(`  ${user.email} -> ${ids[user.email]}`);
  }

  console.log("Provisioning organizations…");
  const orgA = await provisionAsUser("owner@nolt.local", "password123", "North Clinic");
  const orgB = await provisionAsUser("other-owner@nolt.local", "password123", "South Wellness");
  console.log(`  North Clinic: ${orgA}`);
  console.log(`  South Wellness: ${orgB}`);

  // Add multi-org user to both as staff / read_only via service role SQL-ish ops
  const { data: rolesA } = await admin.from("roles").select("id, key").eq("organization_id", orgA);
  const { data: rolesB } = await admin.from("roles").select("id, key").eq("organization_id", orgB);
  const { data: locationsA } = await admin.from("locations").select("id, code").eq("organization_id", orgA);

  const role = (rows: { id: string; key: string }[] | null, key: string) =>
    rows?.find((r) => r.key === key)?.id;

  async function addMember(
    orgId: string,
    email: string,
    roleKey: string,
    mode: "all" | "restricted" = "all",
    locationIds: string[] = [],
  ) {
    const userId = ids[email]!;
    const { data: membership, error } = await admin
      .from("organization_memberships")
      .upsert(
        {
          organization_id: orgId,
          user_id: userId,
          status: "active",
          location_access_mode: mode,
          joined_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,user_id" },
      )
      .select("id")
      .single();
    if (error || !membership) throw error;

    const roleId = role(orgId === orgA ? rolesA : rolesB, roleKey);
    if (!roleId) throw new Error(`Missing role ${roleKey}`);

    await admin.from("membership_roles").upsert({
      membership_id: membership.id,
      role_id: roleId,
    });

    for (const locationId of locationIds) {
      await admin.from("membership_location_scopes").upsert({
        membership_id: membership.id,
        location_id: locationId,
      });
    }
  }

  // Second location in org A for restriction tests
  const { data: loc2 } = await admin
    .from("locations")
    .insert({
      organization_id: orgA,
      name: "Storage",
      code: "STORAGE",
      status: "active",
      country_code: "US",
    })
    .select("id")
    .single();

  const primary = locationsA?.find((l) => l.code === "PRIMARY")?.id;

  await addMember(orgA, "admin@nolt.local", "organization_administrator");
  await addMember(orgA, "multi@nolt.local", "staff");
  await addMember(orgB, "multi@nolt.local", "read_only");
  await addMember(
    orgA,
    "restricted@nolt.local",
    "location_manager",
    "restricted",
    primary ? [primary] : [],
  );
  await addMember(orgA, "readonly@nolt.local", "read_only");

  async function seedCatalog(orgId: string) {
    const units = [
      { name: "Each", symbol: "ea", dimension: "count", unit_kind: "packaging", precision: 0 },
      { name: "Box", symbol: "box", dimension: "count", unit_kind: "packaging", precision: 0 },
      { name: "Case", symbol: "case", dimension: "count", unit_kind: "packaging", precision: 0 },
      { name: "Pack", symbol: "pk", dimension: "count", unit_kind: "packaging", precision: 0 },
      { name: "Bottle", symbol: "btl", dimension: "count", unit_kind: "packaging", precision: 0 },
      { name: "Tube", symbol: "tube", dimension: "count", unit_kind: "packaging", precision: 0 },
      { name: "Vial", symbol: "vial", dimension: "count", unit_kind: "packaging", precision: 0 },
      { name: "Syringe", symbol: "syr", dimension: "count", unit_kind: "packaging", precision: 0 },
      { name: "Milliliter", symbol: "mL", dimension: "volume", unit_kind: "measurement", precision: 2 },
      { name: "Liter", symbol: "L", dimension: "volume", unit_kind: "measurement", precision: 3 },
      { name: "Gram", symbol: "g", dimension: "mass", unit_kind: "measurement", precision: 2 },
      { name: "Kilogram", symbol: "kg", dimension: "mass", unit_kind: "measurement", precision: 3 },
    ];

    for (const unit of units) {
      const { error: insertError } = await admin.from("units_of_measure").insert({
        organization_id: orgId,
        ...unit,
        status: "active",
        is_system: true,
      });
      if (insertError && !/duplicate|unique/i.test(insertError.message)) {
        throw insertError;
      }
    }

    const { data: clinical, error: clinicalError } = await admin
      .from("item_categories")
      .insert({
        organization_id: orgId,
        name: "Clinical supplies",
        status: "active",
        sort_order: 1,
      })
      .select("id")
      .single();
    if (clinicalError) throw clinicalError;

    for (const [name, sort] of [
      ["PPE", 1],
      ["Injection supplies", 2],
      ["Wound care", 3],
    ] as const) {
      const { error } = await admin.from("item_categories").insert({
        organization_id: orgId,
        parent_id: clinical!.id,
        name,
        status: "active",
        sort_order: sort,
      });
      if (error) throw error;
    }

    const { error: officeError } = await admin.from("item_categories").insert({
      organization_id: orgId,
      name: "Office supplies",
      status: "active",
      sort_order: 2,
    });
    if (officeError) throw officeError;

    const { data: unitRows, error: unitsError } = await admin
      .from("units_of_measure")
      .select("id, symbol")
      .eq("organization_id", orgId);
    if (unitsError) throw unitsError;

    const unitBySymbol = Object.fromEntries((unitRows ?? []).map((u) => [u.symbol, u.id]));
    const ea = unitBySymbol.ea;
    const box = unitBySymbol.box;
    const caseUnit = unitBySymbol.case;
    const btl = unitBySymbol.btl;
    const mL = unitBySymbol.mL;

    const { data: ppe } = await admin
      .from("item_categories")
      .select("id")
      .eq("organization_id", orgId)
      .eq("name", "PPE")
      .maybeSingle();

    const { data: injection } = await admin
      .from("item_categories")
      .select("id")
      .eq("organization_id", orgId)
      .eq("name", "Injection supplies")
      .maybeSingle();

    if (!ea || !box || !caseUnit || !btl || !mL) {
      throw new Error("Expected bootstrap units missing");
    }

    const { data: existingGloves } = await admin
      .from("items")
      .select("id")
      .eq("organization_id", orgId)
      .eq("sku", "PPE-GLOVE-NIT")
      .maybeSingle();

    if (!existingGloves) {
      const { data: gloves, error: glovesError } = await admin
        .from("items")
        .insert({
          organization_id: orgId,
          name: "Nitrile exam gloves",
          description: "Powder-free nitrile examination gloves",
          category_id: ppe?.id ?? null,
          base_unit_id: ea,
          default_entry_unit_id: box,
          sku: "PPE-GLOVE-NIT",
          status: "active",
          requires_variant: true,
          allow_negative_stock: false,
        })
        .select("id")
        .single();
      if (glovesError) throw glovesError;

      await admin.from("item_unit_conversions").insert([
        {
          organization_id: orgId,
          item_id: gloves!.id,
          from_unit_id: box,
          to_unit_id: ea,
          multiplier: 100,
        },
        {
          organization_id: orgId,
          item_id: gloves!.id,
          from_unit_id: caseUnit,
          to_unit_id: ea,
          multiplier: 1000,
        },
      ]);

      for (const [name, sku] of [
        ["Small", "PPE-GLOVE-NIT-S"],
        ["Medium", "PPE-GLOVE-NIT-M"],
        ["Large", "PPE-GLOVE-NIT-L"],
      ] as const) {
        const { data: variant, error: variantError } = await admin
          .from("item_variants")
          .insert({
            organization_id: orgId,
            item_id: gloves!.id,
            name,
            sku,
            status: "active",
          })
          .select("id")
          .single();
        if (variantError) throw variantError;

        await admin.from("item_identifiers").insert({
          organization_id: orgId,
          item_id: gloves!.id,
          variant_id: variant!.id,
          identifier_type: "barcode",
          value_display: `${sku}-BC`,
          is_primary: true,
        });
      }

      await admin.from("item_identifiers").insert({
        organization_id: orgId,
        item_id: gloves!.id,
        identifier_type: "internal_code",
        value_display: "GLOVE-NIT-MASTER",
        is_primary: true,
      });
    }

    const { data: existingAlcohol } = await admin
      .from("items")
      .select("id")
      .eq("organization_id", orgId)
      .eq("sku", "INJ-IPA-500")
      .maybeSingle();

    if (!existingAlcohol) {
      const { data: alcohol, error: alcoholError } = await admin
        .from("items")
        .insert({
          organization_id: orgId,
          name: "Isopropyl alcohol 70%",
          description: "500 mL bottle for skin prep",
          category_id: injection?.id ?? null,
          base_unit_id: mL,
          default_entry_unit_id: btl,
          sku: "INJ-IPA-500",
          status: "active",
          requires_variant: false,
          allow_negative_stock: false,
        })
        .select("id")
        .single();
      if (alcoholError) throw alcoholError;

      await admin.from("item_unit_conversions").insert({
        organization_id: orgId,
        item_id: alcohol!.id,
        from_unit_id: btl,
        to_unit_id: mL,
        multiplier: 500,
      });

      await admin.from("item_identifiers").insert({
        organization_id: orgId,
        item_id: alcohol!.id,
        identifier_type: "upc",
        value_display: "012345678905",
        is_primary: true,
      });
    }
  }

  console.log("Seeding catalog primitives…");
  await seedCatalog(orgA);
  await seedCatalog(orgB);

  async function seedStorage(orgId: string, locationId: string, label: string) {
    const { data: existing } = await admin
      .from("storage_areas")
      .select("id")
      .eq("organization_id", orgId)
      .eq("location_id", locationId)
      .eq("code", "SUPPLY")
      .maybeSingle();
    if (existing) return;

    async function area(input: {
      name: string;
      code?: string;
      areaType: string;
      parentId?: string | null;
      sortOrder?: number;
    }) {
      const { data, error } = await admin
        .from("storage_areas")
        .insert({
          organization_id: orgId,
          location_id: locationId,
          parent_id: input.parentId ?? null,
          name: input.name,
          code: input.code ?? null,
          area_type: input.areaType,
          status: "active",
          sort_order: input.sortOrder ?? 0,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data!.id;
    }

    const supply = await area({
      name: "Supply Room",
      code: "SUPPLY",
      areaType: "room",
      sortOrder: 1,
    });
    const cabinetA = await area({
      name: "Cabinet A",
      code: "SUPPLY-CAB-A",
      areaType: "cabinet",
      parentId: supply,
      sortOrder: 1,
    });
    await area({
      name: "Top Shelf",
      code: "SUPPLY-CAB-A-TOP",
      areaType: "shelf",
      parentId: cabinetA,
      sortOrder: 1,
    });
    await area({
      name: "Bottom Shelf",
      code: "SUPPLY-CAB-A-BOT",
      areaType: "shelf",
      parentId: cabinetA,
      sortOrder: 2,
    });

    const treatment = await area({
      name: "Treatment Room 1",
      code: "TX1",
      areaType: "room",
      sortOrder: 2,
    });
    await area({
      name: "Wall Cabinet",
      code: "TX1-WALL",
      areaType: "cabinet",
      parentId: treatment,
      sortOrder: 1,
    });

    const fridge = await area({
      name: "Medication Refrigerator",
      code: "MED-FRIDGE",
      areaType: "refrigerator",
      sortOrder: 3,
    });

    await admin.from("storage_bins").insert([
      {
        organization_id: orgId,
        storage_area_id: fridge,
        name: "Top drawer",
        code: "MED-FRIDGE-D1",
        status: "active",
        sort_order: 1,
      },
      {
        organization_id: orgId,
        storage_area_id: fridge,
        name: "Bottom drawer",
        code: "MED-FRIDGE-D2",
        status: "active",
        sort_order: 2,
      },
      {
        organization_id: orgId,
        storage_area_id: cabinetA,
        name: "Bin 1",
        code: "CAB-A-B1",
        status: "active",
        sort_order: 1,
      },
    ]);

    console.log(`  Storage seeded for ${label}`);
  }

  console.log("Seeding storage hierarchy…");
  if (primary) {
    await seedStorage(orgA, primary, "North Clinic PRIMARY");
  }
  if (loc2?.id) {
    // Smaller tree under the Storage facility for restricted-user isolation tests
    const { data: existingWh } = await admin
      .from("storage_areas")
      .select("id")
      .eq("location_id", loc2.id)
      .eq("code", "WH-MAIN")
      .maybeSingle();
    if (!existingWh) {
      const { data: warehouse, error } = await admin
        .from("storage_areas")
        .insert({
          organization_id: orgA,
          location_id: loc2.id,
          name: "Main Warehouse Floor",
          code: "WH-MAIN",
          area_type: "warehouse",
          status: "active",
          sort_order: 1,
        })
        .select("id")
        .single();
      if (error) throw error;
      await admin.from("storage_areas").insert({
        organization_id: orgA,
        location_id: loc2.id,
        parent_id: warehouse!.id,
        name: "Receiving Shelf",
        code: "WH-RECV",
        area_type: "shelf",
        status: "active",
        sort_order: 1,
      });
      console.log("  Storage seeded for North Clinic STORAGE");
    }
  }

  // Org B primary gets a light tree
  const { data: locationsB } = await admin
    .from("locations")
    .select("id, code")
    .eq("organization_id", orgB);
  const primaryB = locationsB?.find((l) => l.code === "PRIMARY")?.id;
  if (primaryB) {
    await seedStorage(orgB, primaryB, "South Wellness PRIMARY");
  }

  async function seedOpeningBalance(orgId: string, locationId: string, label: string) {
    const { data: existingTxn } = await admin
      .from("inventory_transactions")
      .select("id")
      .eq("organization_id", orgId)
      .eq("transaction_type", "opening_balance")
      .eq("status", "completed")
      .limit(1)
      .maybeSingle();
    if (existingTxn) return;

    const { data: alcohol } = await admin
      .from("items")
      .select("id, base_unit_id, default_entry_unit_id")
      .eq("organization_id", orgId)
      .eq("sku", "INJ-IPA-500")
      .maybeSingle();

    const { data: gloves } = await admin
      .from("items")
      .select("id, base_unit_id, default_entry_unit_id")
      .eq("organization_id", orgId)
      .eq("sku", "PPE-GLOVE-NIT")
      .maybeSingle();

    const { data: medium } = gloves
      ? await admin
          .from("item_variants")
          .select("id")
          .eq("item_id", gloves.id)
          .eq("name", "Medium")
          .maybeSingle()
      : { data: null };

    const { data: fridge } = await admin
      .from("storage_areas")
      .select("id")
      .eq("location_id", locationId)
      .eq("code", "MED-FRIDGE")
      .maybeSingle();

    const { data: topShelf } = await admin
      .from("storage_areas")
      .select("id")
      .eq("location_id", locationId)
      .eq("code", "SUPPLY-CAB-A-TOP")
      .maybeSingle();

    const { data: fridgeBin } = fridge
      ? await admin
          .from("storage_bins")
          .select("id")
          .eq("storage_area_id", fridge.id)
          .eq("code", "MED-FRIDGE-D1")
          .maybeSingle()
      : { data: null };

    if (!alcohol || !gloves || !medium || !fridge || !topShelf) {
      console.log(`  Skipping opening balance for ${label} (missing seed refs)`);
      return;
    }

    const { data: boxUnit } = await admin
      .from("units_of_measure")
      .select("id")
      .eq("organization_id", orgId)
      .eq("symbol", "box")
      .maybeSingle();

    const { data: txn, error: txnError } = await admin
      .from("inventory_transactions")
      .insert({
        organization_id: orgId,
        transaction_type: "opening_balance",
        status: "draft",
        notes: "Bootstrap opening balance",
        transaction_number: "",
        created_by: ids["owner@nolt.local"],
      })
      .select("id")
      .single();
    if (txnError) throw txnError;

    const { error: lineError } = await admin.from("inventory_transaction_lines").insert([
      {
        organization_id: orgId,
        transaction_id: txn!.id,
        line_number: 1,
        item_id: alcohol.id,
        entered_quantity: 2,
        entered_unit_id: alcohol.default_entry_unit_id,
        conversion_multiplier: 500,
        base_quantity: 1000,
        destination_location_id: locationId,
        destination_storage_area_id: fridge.id,
        destination_bin_id: fridgeBin?.id ?? null,
        notes: "2 bottles → 1000 mL",
      },
      {
        organization_id: orgId,
        transaction_id: txn!.id,
        line_number: 2,
        item_id: gloves.id,
        variant_id: medium.id,
        entered_quantity: 3,
        entered_unit_id: boxUnit?.id ?? gloves.default_entry_unit_id,
        conversion_multiplier: 100,
        base_quantity: 300,
        destination_location_id: locationId,
        destination_storage_area_id: topShelf.id,
        notes: "3 boxes Medium gloves → 300 ea",
      },
    ]);
    if (lineError) throw lineError;

    const ownerEmail =
      orgId === orgA ? "owner@nolt.local" : "other-owner@nolt.local";
    const ownerClient = createClient(
      url!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { error: signInError } = await ownerClient.auth.signInWithPassword({
      email: ownerEmail,
      password: "password123",
    });
    if (signInError) throw signInError;

    const { error: completeError } = await ownerClient.rpc("complete_inventory_transaction", {
      p_transaction_id: txn!.id,
    });
    await ownerClient.auth.signOut();
    if (completeError) throw completeError;

    console.log(`  Opening balance seeded for ${label}`);
  }

  console.log("Seeding opening balances…");
  if (primary) {
    await seedOpeningBalance(orgA, primary, "North Clinic PRIMARY");
  }
  if (primaryB) {
    await seedOpeningBalance(orgB, primaryB, "South Wellness PRIMARY");
  }

  // Demo tenants are fully seeded — mark onboarding completed so dashboards stay operational.
  const now = new Date().toISOString();
  for (const orgId of [orgA, orgB]) {
    const { error: onboardingError } = await admin.from("organization_onboarding").upsert({
      organization_id: orgId,
      status: "completed",
      current_step: "review",
      starter_pack: "clinic",
      demo_data_enabled: true,
      details_completed_at: now,
      location_completed_at: now,
      invite_skipped: true,
      starter_completed_at: now,
      catalog_skipped: true,
      modules_completed_at: now,
      completed_at: now,
    });
    if (onboardingError) throw onboardingError;
  }

  await admin.from("audit_events").insert({
    organization_id: orgA,
    actor_user_id: ids["owner@nolt.local"],
    actor_type: "system",
    action: "seed.completed",
    entity_type: "organization",
    entity_id: orgA,
    summary: "Local bootstrap seed completed",
    metadata: {
      orgB,
      storageLocationId: loc2?.id ?? null,
      catalog: true,
      storage: true,
      inventory: true,
    },
  });

  console.log("Bootstrap complete.");
  console.log("Demo passwords: password123");
  console.log("Users:", users.map((u) => u.email).join(", "));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
