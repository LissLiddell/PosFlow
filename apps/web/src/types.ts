export type Role = "ADMIN" | "FINANCE" | "SUPERVISOR" | "CASHIER";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  business: { id: string; name: string; slug: string };
  store: { id: string; name: string; code: string; city?: string } | null;
};

export type Register = {
  id: string;
  name: string;
  code: string;
  cashLimitCents: number;
  closingToleranceCents: number;
  supervisorCanManageBundles: boolean;
  supervisorCanApproveClosures: boolean;
  active: boolean;
  currentShift?: { id: string; status: "OPEN" | "PENDING_REVIEW"; cashier: { name: string } } | null;
  store: { id: string; name: string; code: string; city?: string };
};

export type Category = {
  id: string;
  name: string;
  color?: string;
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  priceCents: number;
  stockQuantity: number;
  active: boolean;
  category: { id: string; name: string; color?: string };
};

export type ProductInput = {
  categoryId: string;
  sku: string;
  name: string;
  priceCents: number;
  stockQuantity: number;
  active: boolean;
};

export type PendingShift = {
  id: string;
  status: "PENDING_REVIEW";
  expectedCashCents: number;
  countedCashCents: number;
  discrepancyCents: number;
  closeRequestedAt: string;
  register: Register;
  cashier: { id: string; name: string };
};

export type CashLine = { denominationCents: number; quantity: number; subtotalCents?: number };

export type StoreSummary = { id: string; name: string; code: string; city?: string };

export type FinanceOverview = {
  generatedAt: string;
  totals: {
    activeDrawerCashCents: number;
    custodyCashCents: number;
    controlledCashCents: number;
    fundingBalanceCents: number;
    payableToNetworkCents: number;
    receivableFromNetworkCents: number;
    commissionCents: number;
    availableRemittanceCents: number;
    availableRemittanceCount: number;
    paidRemittanceCount: number;
    advanceAuthorizedCents: number;
    advanceOutstandingCents: number;
    openAdvanceCount: number;
    overdueAdvanceCount: number;
    settledAdvanceCount: number;
    pendingReviewCount: number;
  };
  stores: Array<StoreSummary & {
    activeDrawerCashCents: number;
    custodyCashCents: number;
    fundingBalanceCents: number;
    advanceOutstandingCents: number;
    availableIncomingCents: number;
  }>;
  activity: Array<{
    id: string;
    kind: string;
    label: string;
    detail: string;
    amountCents: number;
    actor?: { name: string; role: Role } | null;
    occurredAt: string;
  }>;
};

export type Remittance = {
  id: string;
  reference: string;
  status: "AVAILABLE" | "PAID" | "CANCELLED" | "FAILED";
  senderName: string;
  senderPhone?: string;
  beneficiaryName: string;
  amountCents: number;
  feeCents: number;
  totalCollectedCents: number;
  availableAt: string;
  paidAt?: string;
  originStore: StoreSummary;
  destinationStore: StoreSummary;
  sentBy?: { id: string; name: string };
  paidBy?: { id: string; name: string };
};

export type RemittanceSendInput = {
  destinationStoreId: string;
  senderName: string;
  senderPhone?: string;
  beneficiaryName: string;
  beneficiaryDocumentCode: string;
  amountCents: number;
};

export type AdvanceSettlement = {
  id: string;
  type: "EXPENSE_PROOF" | "CASH_RETURN";
  amountCents: number;
  description: string;
  createdAt: string;
  createdBy: { id: string; name: string; role: Role };
};

export type Advance = {
  id: string;
  reference: string;
  status: "AUTHORIZED" | "OPEN" | "PARTIALLY_SETTLED" | "SETTLED" | "CANCELLED";
  recipientType: "EMPLOYEE" | "VENDOR";
  recipientName: string;
  purpose: string;
  amountCents: number;
  proofCents: number;
  returnedCents: number;
  dueDate: string;
  authorizedAt: string;
  issuedAt?: string;
  settledAt?: string;
  store: StoreSummary;
  createdBy: { id: string; name: string };
  authorizedBy: { id: string; name: string };
  issuedBy?: { id: string; name: string };
  settlements: AdvanceSettlement[];
};

export type AdvanceInput = {
  storeId: string;
  recipientType: "EMPLOYEE" | "VENDOR";
  recipientName: string;
  purpose: string;
  amountCents: number;
  dueDate: string;
};

export type CashBundle = {
  id: string;
  reference: string;
  status: "DRAFT" | "SEALED" | "IN_SAFE_CUSTODY" | "TRANSFERRED" | "CANCELLED";
  totalCents: number;
  lines: CashLine[];
  createdAt: string;
  sealedAt?: string;
  preparedBy?: { name: string };
};

export type LedgerEntry = {
  id: string;
  type: string;
  amountCents: number;
  description: string;
  createdAt: string;
};

export type Shift = {
  id: string;
  status: "OPEN" | "PENDING_REVIEW" | "CLOSED";
  openingFloatCents: number;
  expectedCashCents: number;
  countedCashCents?: number;
  discrepancyCents?: number;
  openedAt: string;
  register: Register;
  cashier: { id: string; name: string };
  ledgerEntries: LedgerEntry[];
  cashBundles: CashBundle[];
};

export type ReconciliationReport = {
  shift: {
    id: string;
    status: string;
    openedAt: string;
    closedAt?: string;
    register: Register;
    cashier: { id: string; name: string };
    approvedBy?: { id: string; name: string };
  };
  summary: {
    expectedCashCents: number;
    countedCashCents?: number;
    discrepancyCents?: number;
    saleCount: number;
    salesCents: number;
    sealedBundleCents: number;
  };
  totalsByType: Record<string, number>;
  ledgerEntries: LedgerEntry[];
  cashBundles: CashBundle[];
};
