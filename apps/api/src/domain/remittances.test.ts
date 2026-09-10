import { describe, expect, it } from "vitest";
import { calculateRemittanceFee, remittancePayoutImpact, remittanceSendImpact } from "./remittances.js";

describe("remittance money rules", () => {
  it("uses the minimum fee for a small send", () => {
    expect(calculateRemittanceFee(10_000)).toBe(2_000);
  });

  it("calculates a three-percent fee above the minimum", () => {
    expect(calculateRemittanceFee(100_000)).toBe(3_000);
  });

  it("keeps physical cash and network funding as separate opposite movements", () => {
    expect(remittanceSendImpact(100_000)).toEqual({
      feeCents: 3_000,
      totalCollectedCents: 103_000,
      drawerImpactCents: 103_000,
      fundingImpactCents: -100_000
    });
    expect(remittancePayoutImpact(100_000)).toEqual({ drawerImpactCents: -100_000, fundingImpactCents: 100_000 });
  });

  it("rejects sends outside the configured range", () => {
    expect(() => calculateRemittanceFee(9_999)).toThrow("INVALID_REMITTANCE_AMOUNT");
    expect(() => calculateRemittanceFee(2_000_001)).toThrow("INVALID_REMITTANCE_AMOUNT");
  });
});
