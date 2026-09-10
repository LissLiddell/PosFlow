const MIN_REMITTANCE_CENTS = 10_000;
const MAX_REMITTANCE_CENTS = 2_000_000;
const MIN_FEE_CENTS = 2_000;
const FEE_BASIS_POINTS = 300;

export function calculateRemittanceFee(amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents < MIN_REMITTANCE_CENTS || amountCents > MAX_REMITTANCE_CENTS) {
    throw new Error("INVALID_REMITTANCE_AMOUNT");
  }
  return Math.max(MIN_FEE_CENTS, Math.round(amountCents * FEE_BASIS_POINTS / 10_000));
}

export function remittanceSendImpact(amountCents: number) {
  const feeCents = calculateRemittanceFee(amountCents);
  return {
    feeCents,
    totalCollectedCents: amountCents + feeCents,
    drawerImpactCents: amountCents + feeCents,
    fundingImpactCents: -amountCents
  };
}

export function remittancePayoutImpact(amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("INVALID_REMITTANCE_AMOUNT");
  return { drawerImpactCents: -amountCents, fundingImpactCents: amountCents };
}
