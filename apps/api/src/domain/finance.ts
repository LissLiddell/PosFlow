import { advanceOutstandingCents } from "./advances.js";

export function summarizeFunding(entries: Array<{ amountCents: number }>) {
  const balanceCents = entries.reduce((sum, entry) => sum + entry.amountCents, 0);
  return {
    balanceCents,
    payableToNetworkCents: Math.max(0, -balanceCents),
    receivableFromNetworkCents: Math.max(0, balanceCents)
  };
}

export function summarizeAdvances(
  advances: Array<{
    status: "AUTHORIZED" | "OPEN" | "PARTIALLY_SETTLED" | "SETTLED" | "CANCELLED";
    amountCents: number;
    proofCents: number;
    returnedCents: number;
    dueDate: Date;
  }>,
  now = new Date()
) {
  return advances.reduce((summary, advance) => {
    if (advance.status === "AUTHORIZED") summary.authorizedCents += advance.amountCents;
    if (advance.status === "OPEN" || advance.status === "PARTIALLY_SETTLED") {
      summary.outstandingCents += advanceOutstandingCents(advance.amountCents, advance.proofCents, advance.returnedCents);
      summary.openCount += 1;
      if (advance.dueDate.getTime() < now.getTime()) summary.overdueCount += 1;
    }
    if (advance.status === "SETTLED") summary.settledCount += 1;
    return summary;
  }, { authorizedCents: 0, outstandingCents: 0, openCount: 0, overdueCount: 0, settledCount: 0 });
}
