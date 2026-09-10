import { Router } from "express";
import { asyncRoute, HttpError, parseId } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/shifts/:id/reconciliation", asyncRoute(async (request, response) => {
  const shiftId = parseId(request.params.id, "Shift ID");
  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, register: { store: { businessId: request.auth!.businessId, ...(request.auth!.storeId ? { id: request.auth!.storeId } : {}) } } },
    include: {
      register: { include: { store: true } },
      cashier: { select: { id: true, name: true } },
      closeApprovedBy: { select: { id: true, name: true } },
      ledgerEntries: { orderBy: { createdAt: "asc" } },
      sales: { include: { items: true, payments: true }, orderBy: { createdAt: "asc" } },
      cashBundles: { include: { lines: true }, orderBy: { createdAt: "asc" } },
      cashCounts: { include: { lines: true } }
    }
  });
  if (!shift) throw new HttpError(404, "SHIFT_NOT_FOUND", "The shift was not found.");

  const expectedCashCents = shift.ledgerEntries.reduce((sum, entry) => sum + entry.amountCents, 0);
  const totalsByType = shift.ledgerEntries.reduce<Record<string, number>>((totals, entry) => {
    totals[entry.type] = (totals[entry.type] ?? 0) + entry.amountCents;
    return totals;
  }, {});

  response.json({
    report: {
      shift: {
        id: shift.id,
        status: shift.status,
        openedAt: shift.openedAt,
        closedAt: shift.closedAt,
        register: shift.register,
        cashier: shift.cashier,
        approvedBy: shift.closeApprovedBy
      },
      summary: {
        expectedCashCents,
        countedCashCents: shift.countedCashCents,
        discrepancyCents: shift.discrepancyCents,
        saleCount: shift.sales.length,
        salesCents: shift.sales.reduce((sum, sale) => sum + sale.totalCents, 0),
        sealedBundleCents: shift.cashBundles.filter((bundle) => bundle.status !== "DRAFT" && bundle.status !== "CANCELLED").reduce((sum, bundle) => sum + bundle.totalCents, 0)
      },
      totalsByType,
      ledgerEntries: shift.ledgerEntries,
      sales: shift.sales,
      cashBundles: shift.cashBundles,
      closingCount: shift.cashCounts.find((count) => count.type === "CLOSING") ?? null
    }
  });
}));

export default router;
