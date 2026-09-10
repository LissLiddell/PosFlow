import { describe, expect, it } from "vitest";
import { summarizeAdvances, summarizeFunding } from "./finance.js";

describe("finance consolidation", () => {
  it("separates a network payable from a funding receivable", () => {
    expect(summarizeFunding([{ amountCents: -85_000 }, { amountCents: 60_000 }])).toEqual({
      balanceCents: -25_000,
      payableToNetworkCents: 25_000,
      receivableFromNetworkCents: 0
    });
    expect(summarizeFunding([{ amountCents: 30_000 }]).receivableFromNetworkCents).toBe(30_000);
  });

  it("keeps authorized money separate from issued outstanding money", () => {
    const summary = summarizeAdvances([
      { status: "AUTHORIZED", amountCents: 50_000, proofCents: 0, returnedCents: 0, dueDate: new Date("2026-09-20") },
      { status: "PARTIALLY_SETTLED", amountCents: 60_000, proofCents: 40_000, returnedCents: 5_000, dueDate: new Date("2026-09-01") },
      { status: "SETTLED", amountCents: 30_000, proofCents: 30_000, returnedCents: 0, dueDate: new Date("2026-08-20") }
    ], new Date("2026-09-08"));
    expect(summary).toEqual({ authorizedCents: 50_000, outstandingCents: 15_000, openCount: 1, overdueCount: 1, settledCount: 1 });
  });
});
