export function calculateRemittanceFeePreview(amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents < 10_000 || amountCents > 2_000_000) return 0;
  return Math.max(2_000, Math.round(amountCents * 0.03));
}
