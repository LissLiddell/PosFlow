import { describe, expect, it } from "vitest";
import { advanceOutstandingCents, advanceProgressPercent } from "./advances";

describe("advance presentation totals", () => {
  it("subtracts both proofs and returned cash from the pending balance", () => {
    expect(advanceOutstandingCents({ amountCents: 60_000, proofCents: 45_000, returnedCents: 10_000 })).toBe(5_000);
  });

  it("shows a complete progress bar when the advance is settled", () => {
    expect(advanceProgressPercent({ amountCents: 60_000, proofCents: 45_000, returnedCents: 15_000 })).toBe(100);
  });

  it("never displays negative pending money or progress above one hundred", () => {
    const inconsistent = { amountCents: 60_000, proofCents: 50_000, returnedCents: 20_000 };
    expect(advanceOutstandingCents(inconsistent)).toBe(0);
    expect(advanceProgressPercent(inconsistent)).toBe(100);
  });
});
