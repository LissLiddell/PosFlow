export type FundingTotals = {
  payableToNetworkCents: number;
  receivableFromNetworkCents: number;
};

export function fundingPosition(totals: FundingTotals) {
  if (totals.payableToNetworkCents > 0) {
    return { label: "Por liquidar a la red", valueCents: totals.payableToNetworkCents, tone: "payable" as const };
  }
  if (totals.receivableFromNetworkCents > 0) {
    return { label: "A favor de las tiendas", valueCents: totals.receivableFromNetworkCents, tone: "receivable" as const };
  }
  return { label: "Fondeo compensado", valueCents: 0, tone: "balanced" as const };
}

export function signedCurrencyAmount(amountCents: number, formatter: (value: number) => string) {
  if (amountCents === 0) return formatter(0);
  return `${amountCents > 0 ? "+" : "−"}${formatter(Math.abs(amountCents))}`;
}
