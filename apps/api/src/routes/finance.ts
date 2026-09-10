import { AdvanceSettlementType, AdvanceStatus, CashBundleStatus, RemittanceStatus, Role, ShiftStatus } from "@prisma/client";
import { Router } from "express";
import { summarizeAdvances, summarizeFunding } from "../domain/finance.js";
import { asyncRoute } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireRole(Role.FINANCE, Role.ADMIN));

router.get("/overview", asyncRoute(async (request, response) => {
  const businessId = request.auth!.businessId;
  const [stores, activeShifts, custodyBundles, fundingEntries, remittances, advances, settlements, pendingReviewCount] = await Promise.all([
    prisma.store.findMany({
      where: { businessId },
      select: { id: true, name: true, code: true, city: true },
      orderBy: { name: "asc" }
    }),
    prisma.shift.findMany({
      where: { status: { in: [ShiftStatus.OPEN, ShiftStatus.PENDING_REVIEW] }, register: { store: { businessId } } },
      select: {
        id: true,
        status: true,
        register: { select: { code: true, name: true, storeId: true, store: { select: { name: true, code: true } } } },
        ledgerEntries: { select: { amountCents: true } }
      }
    }),
    prisma.cashBundle.findMany({
      where: { businessId, status: { in: [CashBundleStatus.SEALED, CashBundleStatus.IN_SAFE_CUSTODY] } },
      select: { totalCents: true, shift: { select: { register: { select: { storeId: true } } } } }
    }),
    prisma.fundingEntry.findMany({
      where: { businessId },
      select: { id: true, storeId: true, type: true, amountCents: true, description: true, createdAt: true, store: { select: { name: true, code: true } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.remittance.findMany({
      where: { businessId, status: { in: [RemittanceStatus.AVAILABLE, RemittanceStatus.PAID] } },
      select: {
        id: true,
        reference: true,
        status: true,
        amountCents: true,
        feeCents: true,
        totalCollectedCents: true,
        originStoreId: true,
        destinationStoreId: true,
        createdAt: true,
        paidAt: true,
        originStore: { select: { name: true, code: true } },
        destinationStore: { select: { name: true, code: true } },
        sentBy: { select: { name: true, role: true } },
        paidBy: { select: { name: true, role: true } }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.advance.findMany({
      where: { businessId, status: { not: AdvanceStatus.CANCELLED } },
      select: {
        id: true,
        storeId: true,
        reference: true,
        recipientName: true,
        status: true,
        amountCents: true,
        proofCents: true,
        returnedCents: true,
        dueDate: true,
        authorizedAt: true,
        issuedAt: true,
        settledAt: true,
        store: { select: { name: true, code: true } },
        issuedBy: { select: { name: true, role: true } }
      },
      orderBy: { dueDate: "asc" }
    }),
    prisma.advanceSettlement.findMany({
      where: { businessId },
      select: {
        id: true,
        type: true,
        amountCents: true,
        description: true,
        createdAt: true,
        advance: { select: { reference: true, store: { select: { name: true, code: true } } } },
        createdBy: { select: { name: true, role: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.shift.count({ where: { status: ShiftStatus.PENDING_REVIEW, register: { store: { businessId } } } })
  ]);

  const drawerByStore = new Map<string, number>();
  for (const shift of activeShifts) {
    const amount = shift.ledgerEntries.reduce((sum, entry) => sum + entry.amountCents, 0);
    drawerByStore.set(shift.register.storeId, (drawerByStore.get(shift.register.storeId) ?? 0) + amount);
  }
  const custodyByStore = new Map<string, number>();
  for (const bundle of custodyBundles) {
    const storeId = bundle.shift.register.storeId;
    custodyByStore.set(storeId, (custodyByStore.get(storeId) ?? 0) + bundle.totalCents);
  }
  const fundingByStore = new Map<string, number>();
  for (const entry of fundingEntries) fundingByStore.set(entry.storeId, (fundingByStore.get(entry.storeId) ?? 0) + entry.amountCents);
  const advanceByStore = new Map<string, number>();
  for (const advance of advances) {
    if (advance.status !== AdvanceStatus.OPEN && advance.status !== AdvanceStatus.PARTIALLY_SETTLED) continue;
    const pending = Math.max(0, advance.amountCents - advance.proofCents - advance.returnedCents);
    advanceByStore.set(advance.storeId, (advanceByStore.get(advance.storeId) ?? 0) + pending);
  }
  const incomingByStore = new Map<string, number>();
  for (const remittance of remittances) {
    if (remittance.status !== RemittanceStatus.AVAILABLE) continue;
    incomingByStore.set(remittance.destinationStoreId, (incomingByStore.get(remittance.destinationStoreId) ?? 0) + remittance.amountCents);
  }

  const funding = summarizeFunding(fundingEntries);
  const advanceSummary = summarizeAdvances(advances);
  const activeDrawerCashCents = [...drawerByStore.values()].reduce((sum, value) => sum + value, 0);
  const custodyCashCents = custodyBundles.reduce((sum, bundle) => sum + bundle.totalCents, 0);
  const availableRemittances = remittances.filter((item) => item.status === RemittanceStatus.AVAILABLE);

  const activity = [
    ...remittances.flatMap((item) => {
      const rows = [{
        id: `send-${item.id}`,
        kind: "REMITTANCE_SEND",
        label: `Envío ${item.reference}`,
        detail: `${item.originStore.code} → ${item.destinationStore.code} · incluye comisión`,
        amountCents: item.totalCollectedCents,
        actor: item.sentBy,
        occurredAt: item.createdAt
      }];
      if (item.paidAt) rows.push({
        id: `pay-${item.id}`,
        kind: "REMITTANCE_PAYOUT",
        label: `Pago ${item.reference}`,
        detail: `${item.destinationStore.code} · efectivo entregado`,
        amountCents: -item.amountCents,
        actor: item.paidBy,
        occurredAt: item.paidAt
      });
      return rows;
    }),
    ...advances.flatMap((item) => item.issuedAt ? [{
      id: `advance-${item.id}`,
      kind: "ADVANCE_ISSUED",
      label: `Anticipo ${item.reference}`,
      detail: `${item.store.code} · ${item.recipientName}`,
      amountCents: -item.amountCents,
      actor: item.issuedBy,
      occurredAt: item.issuedAt
    }] : []),
    ...settlements.map((item) => ({
      id: `settlement-${item.id}`,
      kind: item.type,
      label: item.type === AdvanceSettlementType.CASH_RETURN ? `Devolución ${item.advance.reference}` : `Comprobación ${item.advance.reference}`,
      detail: `${item.advance.store.code} · ${item.description}`,
      amountCents: item.type === AdvanceSettlementType.CASH_RETURN ? item.amountCents : 0,
      actor: item.createdBy,
      occurredAt: item.createdAt
    }))
  ].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime()).slice(0, 12);

  response.json({
    overview: {
      generatedAt: new Date(),
      totals: {
        activeDrawerCashCents,
        custodyCashCents,
        controlledCashCents: activeDrawerCashCents + custodyCashCents,
        fundingBalanceCents: funding.balanceCents,
        payableToNetworkCents: funding.payableToNetworkCents,
        receivableFromNetworkCents: funding.receivableFromNetworkCents,
        commissionCents: remittances.reduce((sum, item) => sum + item.feeCents, 0),
        availableRemittanceCents: availableRemittances.reduce((sum, item) => sum + item.amountCents, 0),
        availableRemittanceCount: availableRemittances.length,
        paidRemittanceCount: remittances.filter((item) => item.status === RemittanceStatus.PAID).length,
        advanceAuthorizedCents: advanceSummary.authorizedCents,
        advanceOutstandingCents: advanceSummary.outstandingCents,
        openAdvanceCount: advanceSummary.openCount,
        overdueAdvanceCount: advanceSummary.overdueCount,
        settledAdvanceCount: advanceSummary.settledCount,
        pendingReviewCount
      },
      stores: stores.map((store) => ({
        ...store,
        activeDrawerCashCents: drawerByStore.get(store.id) ?? 0,
        custodyCashCents: custodyByStore.get(store.id) ?? 0,
        fundingBalanceCents: fundingByStore.get(store.id) ?? 0,
        advanceOutstandingCents: advanceByStore.get(store.id) ?? 0,
        availableIncomingCents: incomingByStore.get(store.id) ?? 0
      })),
      activity
    }
  });
}));

export default router;
