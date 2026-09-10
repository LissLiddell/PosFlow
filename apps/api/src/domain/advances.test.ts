import { describe, expect, it } from "vitest";
import { advanceCashImpact, advanceOutstandingCents, advanceSettlementDecision } from "./advances.js";

describe("advance lifecycle", () => {
  it("starts with the entire issued amount outstanding", () => {
    expect(advanceOutstandingCents(60_000, 0, 0)).toBe(60_000);
  });

  it("becomes partially settled after an expense proof", () => {
    expect(advanceSettlementDecision(60_000, 0, 0, "EXPENSE_PROOF", 45_000)).toEqual({
      nextProofCents: 45_000,
      nextReturnedCents: 0,
      nextOutstandingCents: 15_000,
      status: "PARTIALLY_SETTLED"
    });
  });

  it("settles when proofs and cash returns cover the issued amount", () => {
    expect(advanceSettlementDecision(60_000, 45_000, 0, "CASH_RETURN", 15_000).status).toBe("SETTLED");
  });

  it("rejects settlements greater than the pending balance", () => {
    expect(() => advanceSettlementDecision(60_000, 45_000, 0, "CASH_RETURN", 15_001)).toThrow("SETTLEMENT_EXCEEDS_OUTSTANDING");
  });

  it("moves physical cash in opposite directions when issued and returned", () => {
    expect(advanceCashImpact("ISSUE", 60_000)).toBe(-60_000);
    expect(advanceCashImpact("RETURN", 15_000)).toBe(15_000);
  });
});
