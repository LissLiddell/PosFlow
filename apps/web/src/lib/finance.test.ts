import { describe, expect, it } from "vitest";
import { fundingPosition, signedCurrencyAmount } from "./finance";

describe("finance presentation", () => {
  it("labels payables and receivables without mixing their meaning", () => {
    expect(fundingPosition({ payableToNetworkCents: 25_000, receivableFromNetworkCents: 0 })).toEqual({
      label: "Por liquidar a la red",
      valueCents: 25_000,
      tone: "payable"
    });
    expect(fundingPosition({ payableToNetworkCents: 0, receivableFromNetworkCents: 18_000 }).tone).toBe("receivable");
  });

  it("adds an explicit accounting direction to activity amounts", () => {
    const formatter = (value: number) => `$${(value / 100).toFixed(2)}`;
    expect(signedCurrencyAmount(12_500, formatter)).toBe("+$125.00");
    expect(signedCurrencyAmount(-6_000, formatter)).toBe("−$60.00");
  });
});
