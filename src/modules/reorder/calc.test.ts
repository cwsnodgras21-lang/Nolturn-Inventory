import { describe, expect, it } from "vitest";
import {
  effectiveReorderRule,
  isUsableLot,
  stockStateFor,
  suggestedReorderQuantity,
  sumAvailableAtLocation,
} from "@/modules/reorder/calc";

describe("reorder calculations", () => {
  it("marks only active non-expired lots as usable", () => {
    expect(isUsableLot({ status: "active", expirationDate: null }, "2026-08-02")).toBe(true);
    expect(isUsableLot({ status: "active", expirationDate: "2026-08-02" }, "2026-08-02")).toBe(
      true,
    );
    expect(isUsableLot({ status: "active", expirationDate: "2026-08-01" }, "2026-08-02")).toBe(
      false,
    );
    expect(isUsableLot({ status: "quarantined", expirationDate: null }, "2026-08-02")).toBe(false);
    expect(isUsableLot(null, "2026-08-02")).toBe(true);
  });

  it("derives low and out of stock states", () => {
    expect(stockStateFor(0, 5)).toBe("out");
    expect(stockStateFor(-1, 5)).toBe("out");
    expect(stockStateFor(2, 5)).toBe("low");
    expect(stockStateFor(5, 5)).toBe("ok");
  });

  it("suggests target fill or fixed reorder quantity", () => {
    expect(
      suggestedReorderQuantity({
        available: 2,
        minimum: 5,
        target: 20,
        reorderQuantity: null,
      }),
    ).toBe(18);
    expect(
      suggestedReorderQuantity({
        available: 2,
        minimum: 5,
        target: 20,
        reorderQuantity: 12,
      }),
    ).toBe(12);
    expect(
      suggestedReorderQuantity({
        available: 10,
        minimum: 5,
        target: 20,
        reorderQuantity: 12,
      }),
    ).toBe(0);
  });

  it("prefers location override over default rule", () => {
    const rules = [
      {
        id: "default",
        itemId: "item-1",
        variantId: null,
        locationId: null,
        minimumQuantity: 5,
        targetQuantity: 20,
        reorderQuantity: null,
        preferredSupplierId: null,
        status: "active",
      },
      {
        id: "override",
        itemId: "item-1",
        variantId: null,
        locationId: "loc-a",
        minimumQuantity: 10,
        targetQuantity: 40,
        reorderQuantity: 15,
        preferredSupplierId: "sup-1",
        status: "active",
      },
    ];
    expect(effectiveReorderRule(rules, "item-1", null, "loc-a")?.id).toBe("override");
    expect(effectiveReorderRule(rules, "item-1", null, "loc-b")?.id).toBe("default");
  });

  it("sums usable balances and excludes quarantined/expired lots", () => {
    const total = sumAvailableAtLocation(
      [
        {
          itemId: "item-1",
          variantId: null,
          locationId: "loc-a",
          quantityOnHand: 4,
          lot: { status: "active", expirationDate: "2026-12-01" },
        },
        {
          itemId: "item-1",
          variantId: null,
          locationId: "loc-a",
          quantityOnHand: 7,
          lot: { status: "quarantined", expirationDate: null },
        },
        {
          itemId: "item-1",
          variantId: null,
          locationId: "loc-a",
          quantityOnHand: 3,
          lot: { status: "active", expirationDate: "2026-01-01" },
        },
        {
          itemId: "item-1",
          variantId: null,
          locationId: "loc-a",
          quantityOnHand: 2,
          lot: null,
        },
      ],
      "item-1",
      null,
      "loc-a",
      "2026-08-02",
    );
    expect(total).toBe(6);
  });
});
