import { describe, expect, it } from "vitest";
import { ITEM_CSV_TEMPLATE, validateItemCsvRows } from "@/modules/onboarding/csv";

const units = new Set(["each", "box"]);
const categories = new Set(["ppe", "injection supplies"]);

describe("validateItemCsvRows", () => {
  it("accepts the downloadable template against starter symbols", () => {
    const result = validateItemCsvRows(ITEM_CSV_TEMPLATE, {
      existingSkus: new Set(),
      unitSymbols: units,
      categoryNames: categories,
    });
    expect(result.errorCount).toBe(0);
    expect(result.validCount).toBe(2);
  });

  it("flags missing columns", () => {
    const result = validateItemCsvRows("name,sku\nA,1", {
      existingSkus: new Set(),
      unitSymbols: units,
      categoryNames: categories,
    });
    expect(result.errors.some((e) => e.message.includes("base_unit"))).toBe(true);
  });

  it("detects duplicate SKUs in file and catalog", () => {
    const csv = `name,sku,base_unit,entry_unit,category,description
A,SKU-1,each,each,,
B,SKU-1,each,each,,
C,EXISTING,each,each,,
`;
    const result = validateItemCsvRows(csv, {
      existingSkus: new Set(["existing"]),
      unitSymbols: units,
      categoryNames: categories,
    });
    expect(result.errors.some((e) => e.message.includes("Duplicate SKU"))).toBe(true);
    expect(result.errors.some((e) => e.message.includes("already exists"))).toBe(true);
  });

  it("rejects unknown units and categories", () => {
    const csv = `name,sku,base_unit,entry_unit,category,description
A,SKU-9,kg,kg,Unknown,,
`;
    const result = validateItemCsvRows(csv, {
      existingSkus: new Set(),
      unitSymbols: units,
      categoryNames: categories,
    });
    expect(result.errors.some((e) => e.field === "base_unit")).toBe(true);
    expect(result.errors.some((e) => e.field === "category")).toBe(true);
  });
});
