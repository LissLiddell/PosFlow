export type AdvanceLifecycleStatus = "OPEN" | "PARTIALLY_SETTLED" | "SETTLED";

export function advanceOutstandingCents(amountCents: number, proofCents: number, returnedCents: number) {
  const values = [amountCents, proofCents, returnedCents];
  if (!values.every(Number.isInteger) || amountCents <= 0 || proofCents < 0 || returnedCents < 0 || proofCents + returnedCents > amountCents) {
    throw new Error("INVALID_ADVANCE_TOTALS");
  }
  return amountCents - proofCents - returnedCents;
}

export function advanceSettlementDecision(
  amountCents: number,
  proofCents: number,
  returnedCents: number,
  settlementType: "EXPENSE_PROOF" | "CASH_RETURN",
  settlementCents: number
) {
  if (!Number.isInteger(settlementCents) || settlementCents <= 0) throw new Error("INVALID_SETTLEMENT_AMOUNT");
  const outstandingCents = advanceOutstandingCents(amountCents, proofCents, returnedCents);
  if (settlementCents > outstandingCents) throw new Error("SETTLEMENT_EXCEEDS_OUTSTANDING");

  const nextProofCents = proofCents + (settlementType === "EXPENSE_PROOF" ? settlementCents : 0);
  const nextReturnedCents = returnedCents + (settlementType === "CASH_RETURN" ? settlementCents : 0);
  const nextOutstandingCents = amountCents - nextProofCents - nextReturnedCents;
  const status: AdvanceLifecycleStatus = nextOutstandingCents === 0
    ? "SETTLED"
    : nextProofCents + nextReturnedCents > 0
      ? "PARTIALLY_SETTLED"
      : "OPEN";

  return { nextProofCents, nextReturnedCents, nextOutstandingCents, status };
}

export function advanceCashImpact(type: "ISSUE" | "RETURN", amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("INVALID_ADVANCE_AMOUNT");
  return type === "ISSUE" ? -amountCents : amountCents;
}
