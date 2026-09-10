import { describe, expect, it } from "vitest";
import { consolidateSaleQuantities, inventoryDecision, saleTenderDecision } from "./sales.js";

describe("sale and inventory rules", () => {
  it("consolidates duplicate product lines before changing inventory", () => {
    expect([...consolidateSaleQuantities([{ productId: "agua", quantity: 2 }, { productId: "agua", quantity: 3 }])]).toEqual([["agua", 5]]);
  });

  it("prevents duplicate lines from bypassing the 99-unit sale limit", () => {
    expect(() => consolidateSaleQuantities([{ productId: "agua", quantity: 60 }, { productId: "agua", quantity: 40 }])).toThrow("INVALID_ITEM_QUANTITY");
  });

  it.each([
    [[], "EMPTY_SALE"],
    [[{ productId: "agua", quantity: 0 }], "INVALID_ITEM_QUANTITY"],
    [[{ productId: "", quantity: 1 }], "INVALID_ITEM_QUANTITY"]
  ] as const)("rejects malformed sale quantities %#", (items, code) => {
    expect(() => consolidateSaleQuantities(items)).toThrow(code);
  });

  it("accepts exact cash and does not invent change", () => {
    expect(saleTenderDecision(12_500, 12_500)).toEqual({ sufficient: true, changeCents: 0 });
  });

  it("calculates customer change without adding it to drawer revenue", () => {
    expect(saleTenderDecision(12_500, 20_000)).toEqual({ sufficient: true, changeCents: 7_500 });
  });

  it("rejects a tender below the sale total", () => {
    expect(saleTenderDecision(12_500, 12_499)).toEqual({ sufficient: false, changeCents: 0 });
  });

  it("allows a sale that consumes the exact remaining stock", () => {
    expect(inventoryDecision(4, 4)).toEqual({ available: true, remainingQuantity: 0 });
  });

  it("keeps an insufficient-stock decision from going negative", () => {
    expect(inventoryDecision(3, 4)).toEqual({ available: false, remainingQuantity: 0 });
  });
});
