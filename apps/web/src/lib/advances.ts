import type { Advance } from "../types";

type AdvanceTotals = Pick<Advance, "amountCents" | "proofCents" | "returnedCents">;

export function advanceOutstandingCents(advance: AdvanceTotals) {
  return Math.max(0, advance.amountCents - advance.proofCents - advance.returnedCents);
}

export function advanceProgressPercent(advance: AdvanceTotals) {
  if (advance.amountCents <= 0) return 0;
  return Math.min(100, Math.round(((advance.proofCents + advance.returnedCents) / advance.amountCents) * 100));
}
