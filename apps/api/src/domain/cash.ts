export const MXN_DENOMINATIONS_CENTS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50] as const;

export type DenominationInput = {
  denominationCents: number;
  quantity: number;
};

export type CalculatedCashLine = DenominationInput & {
  subtotalCents: number;
};

export function calculateCashLines(input: DenominationInput[], options: { allowZero?: boolean } = {}) {
  const seen = new Set<number>();
  const lines: CalculatedCashLine[] = [];

  for (const item of input) {
    if (!Number.isInteger(item.denominationCents) || !MXN_DENOMINATIONS_CENTS.includes(item.denominationCents as typeof MXN_DENOMINATIONS_CENTS[number])) {
      throw new Error("UNSUPPORTED_DENOMINATION");
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 0 || item.quantity > 1000) {
      throw new Error("INVALID_QUANTITY");
    }
    if (seen.has(item.denominationCents)) throw new Error("DUPLICATE_DENOMINATION");
    seen.add(item.denominationCents);
    if (item.quantity === 0) continue;
    lines.push({ ...item, subtotalCents: item.denominationCents * item.quantity });
  }

  const totalCents = lines.reduce((sum, line) => sum + line.subtotalCents, 0);
  if (totalCents <= 0 && !options.allowZero) throw new Error("EMPTY_CASH_COUNT");
  return { lines, totalCents };
}

export function sumLedger(entries: Array<{ amountCents: number }>) {
  return entries.reduce((sum, entry) => sum + entry.amountCents, 0);
}

export function closingDecision(expectedCents: number, countedCents: number, toleranceCents = 100) {
  const discrepancyCents = countedCents - expectedCents;
  return {
    discrepancyCents,
    requiresApproval: Math.abs(discrepancyCents) > toleranceCents
  };
}

export function cashLimitDecision(expectedCents: number, saleCents: number, limitCents: number) {
  const projectedCashCents = expectedCents + saleCents;
  return {
    projectedCashCents,
    blocked: projectedCashCents > limitCents
  };
}
