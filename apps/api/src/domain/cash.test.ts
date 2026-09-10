import { describe, expect, it } from "vitest";
import { calculateCashLines, cashLimitDecision, closingDecision, sumLedger } from "./cash.js";

describe("cash-control rules", () => {
  it("calculates denomination totals without floating point money", () => {
    expect(calculateCashLines([
      { denominationCents: 50000, quantity: 2 },
      { denominationCents: 2000, quantity: 3 }
    ])).toEqual({
      lines: [
        { denominationCents: 50000, quantity: 2, subtotalCents: 100000 },
        { denominationCents: 2000, quantity: 3, subtotalCents: 6000 }
      ],
      totalCents: 106000
    });
  });

  it("rejects denominations outside the supported cash set", () => {
    expect(() => calculateCashLines([{ denominationCents: 300, quantity: 1 }])).toThrow("UNSUPPORTED_DENOMINATION");
  });

  it("rejects duplicate denomination lines", () => {
    expect(() => calculateCashLines([
      { denominationCents: 1000, quantity: 1 },
      { denominationCents: 1000, quantity: 2 }
    ])).toThrow("DUPLICATE_DENOMINATION");
  });

  it("keeps an empty fajilla invalid", () => {
    expect(() => calculateCashLines([])).toThrow("EMPTY_CASH_COUNT");
  });

  it("accepts a confirmed zero cash count at closing", () => {
    expect(calculateCashLines([], { allowZero: true })).toEqual({ lines: [], totalCents: 0 });
    expect(closingDecision(0, 0)).toEqual({ discrepancyCents: 0, requiresApproval: false });
  });

  it("still reviews a zero count when cash was expected", () => {
    expect(closingDecision(100000, 0)).toEqual({ discrepancyCents: -100000, requiresApproval: true });
  });

  it("calculates the expected drawer balance from signed entries", () => {
    expect(sumLedger([{ amountCents: 200000 }, { amountCents: 37500 }, { amountCents: -50000 }])).toBe(187500);
  });

  it("requires approval when a close exceeds tolerance", () => {
    expect(closingDecision(187500, 186000)).toEqual({ discrepancyCents: -1500, requiresApproval: true });
  });

  it("keeps a positive discrepancy when counted cash is above the expected drawer balance", () => {
    expect(closingDecision(348700, 400000, 100)).toEqual({ discrepancyCents: 51300, requiresApproval: true });
  });

  it("allows a one-peso rounding tolerance", () => {
    expect(closingDecision(187500, 187450)).toEqual({ discrepancyCents: -50, requiresApproval: false });
  });

  it("blocks the sale that would exceed the configured drawer limit", () => {
    expect(cashLimitDecision(200000, 2400, 202000)).toEqual({ projectedCashCents: 202400, blocked: true });
  });

  it("allows a sale that reaches the drawer limit exactly", () => {
    expect(cashLimitDecision(200000, 2000, 202000)).toEqual({ projectedCashCents: 202000, blocked: false });
  });

  it("uses the register-specific closing tolerance", () => {
    expect(closingDecision(100000, 99500, 1000)).toEqual({ discrepancyCents: -500, requiresApproval: false });
  });
});
