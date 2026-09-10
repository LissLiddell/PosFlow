import { describe, expect, it } from "vitest";
import { advanceCashImpact, advanceSettlementDecision } from "./advances.js";
import { cashLimitDecision, closingDecision, sumLedger } from "./cash.js";
import { remittancePayoutImpact, remittanceSendImpact } from "./remittances.js";

type Entry = { amountCents: number };

function reconcile(entries: Entry[], countedCents: number, toleranceCents = 100) {
  const expectedCents = sumLedger(entries);
  return { expectedCents, ...closingDecision(expectedCents, countedCents, toleranceCents) };
}

describe("full cash-operation scenarios", () => {
  it.each([
    ["opening only", [100_000], 100_000],
    ["cash sale", [100_000, 25_000], 125_000],
    ["issued advance", [100_000, advanceCashImpact("ISSUE", 30_000)], 70_000],
    ["advance cash return", [100_000, -30_000, advanceCashImpact("RETURN", 10_000)], 80_000],
    ["sealed bundle", [100_000, 50_000, -40_000], 110_000],
    ["paid remittance", [100_000, remittancePayoutImpact(20_000).drawerImpactCents], 80_000],
    ["sent remittance", [100_000, remittanceSendImpact(50_000).drawerImpactCents], 152_000],
    ["mixed operation", [100_000, 25_000, 52_000, -20_000, -30_000, 5_000, -40_000], 92_000]
  ])("calculates the expected drawer for %s", (_name, movements, expected) => {
    expect(sumLedger(movements.map((amountCents) => ({ amountCents })))).toBe(expected);
  });

  it.each([
    ["balanced without bundle", [100_000, 25_000], 125_000, 0, false],
    ["balanced with bundle", [100_000, 25_000, -40_000], 85_000, 0, false],
    ["shortage", [100_000, 25_000], 120_000, -5_000, true],
    ["surplus", [100_000, 25_000], 130_000, 5_000, true],
    ["negative tolerance edge", [100_000], 99_900, -100, false],
    ["positive tolerance edge", [100_000], 100_100, 100, false],
    ["one cent beyond tolerance", [100_000], 100_101, 101, true]
  ])("reconciles a %s close", (_name, movements, counted, discrepancy, requiresApproval) => {
    expect(reconcile(movements.map((amountCents) => ({ amountCents })), counted)).toEqual({
      expectedCents: sumLedger(movements.map((amountCents) => ({ amountCents }))),
      discrepancyCents: discrepancy,
      requiresApproval
    });
  });

  it("allows a physically balanced close while an advance remains accountable", () => {
    const ledger = [{ amountCents: 100_000 }, { amountCents: advanceCashImpact("ISSUE", 30_000) }];
    expect(reconcile(ledger, 70_000).requiresApproval).toBe(false);
    expect(advanceSettlementDecision(30_000, 20_000, 0, "EXPENSE_PROOF", 5_000)).toMatchObject({
      nextOutstandingCents: 5_000,
      status: "PARTIALLY_SETTLED"
    });
  });

  it("flags a surplus if pending advance cash is incorrectly counted inside the drawer", () => {
    expect(reconcile([{ amountCents: 100_000 }, { amountCents: -30_000 }], 100_000)).toMatchObject({
      discrepancyCents: 30_000,
      requiresApproval: true
    });
  });

  it("keeps an expense proof out of the physical-cash ledger", () => {
    const beforeProof = sumLedger([{ amountCents: 100_000 }, { amountCents: -30_000 }]);
    advanceSettlementDecision(30_000, 0, 0, "EXPENSE_PROOF", 20_000);
    expect(beforeProof).toBe(70_000);
  });

  it("records a later cash return in the receiving shift, not the closed issuing shift", () => {
    const issuingShift = sumLedger([{ amountCents: 100_000 }, { amountCents: -30_000 }]);
    const receivingShift = sumLedger([{ amountCents: 50_000 }, { amountCents: advanceCashImpact("RETURN", 10_000) }]);
    expect({ issuingShift, receivingShift }).toEqual({ issuingShift: 70_000, receivingShift: 60_000 });
  });

  it("settles an all-proof advance while preserving its original cash exit", () => {
    expect(advanceSettlementDecision(30_000, 0, 0, "EXPENSE_PROOF", 30_000).status).toBe("SETTLED");
    expect(sumLedger([{ amountCents: 100_000 }, { amountCents: -30_000 }])).toBe(70_000);
  });

  it("settles a mixed advance and returns only the unspent portion to the drawer", () => {
    const decision = advanceSettlementDecision(30_000, 20_000, 0, "CASH_RETURN", 10_000);
    expect(decision.status).toBe("SETTLED");
    expect(sumLedger([{ amountCents: 100_000 }, { amountCents: -30_000 }, { amountCents: 10_000 }])).toBe(80_000);
  });

  it("does not add remittance funding to physical drawer cash", () => {
    const impact = remittanceSendImpact(50_000);
    expect(sumLedger([{ amountCents: 100_000 }, { amountCents: impact.drawerImpactCents }])).toBe(152_000);
    expect(impact.fundingImpactCents).toBe(-50_000);
  });

  it("lets a sealed bundle create room below the drawer limit", () => {
    expect(cashLimitDecision(490_000, 20_000, 500_000).blocked).toBe(true);
    expect(cashLimitDecision(390_000, 20_000, 500_000).blocked).toBe(false);
  });

  it("blocks an advance return that would overflow the drawer limit", () => {
    expect(cashLimitDecision(490_000, advanceCashImpact("RETURN", 20_000), 500_000)).toEqual({
      projectedCashCents: 510_000,
      blocked: true
    });
  });

  it("treats an authorized but unissued advance as zero physical movement", () => {
    expect(sumLedger([{ amountCents: 100_000 }])).toBe(100_000);
  });
});
