import { describe, expect, it } from "vitest";
import { calculateRemittanceFeePreview } from "./remittances";

describe("remittance fee preview", () => {
  it("matches the minimum and percentage policies used by the API", () => {
    expect(calculateRemittanceFeePreview(10_000)).toBe(2_000);
    expect(calculateRemittanceFeePreview(100_000)).toBe(3_000);
  });

  it("does not quote invalid amounts", () => {
    expect(calculateRemittanceFeePreview(9_999)).toBe(0);
    expect(calculateRemittanceFeePreview(2_000_001)).toBe(0);
  });
});
