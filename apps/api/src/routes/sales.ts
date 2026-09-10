import { Prisma, Role, ShiftStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { cashLimitDecision } from "../domain/cash.js";
import { consolidateSaleQuantities, inventoryDecision, saleTenderDecision } from "../domain/sales.js";
import { asyncRoute, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const saleSchema = z.object({
  shiftId: z.string().uuid(),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(99) })).min(1).max(50),
  cashReceivedCents: z.number().int().positive().max(100_000_000)
});

router.post("/", requireRole(Role.SUPERVISOR, Role.CASHIER), asyncRoute(async (request, response) => {
  const input = saleSchema.safeParse(request.body);
  if (!input.success) throw new HttpError(422, "VALIDATION_ERROR", "Check the cart and cash received.", input.error.flatten());

  let quantities: Map<string, number>;
  try {
    quantities = consolidateSaleQuantities(input.data.items);
  } catch {
    throw new HttpError(422, "VALIDATION_ERROR", "Revisa las cantidades del carrito.");
  }

  const result = await prisma.$transaction(async (transaction) => {
    const shift = await transaction.shift.findFirst({
      where: {
        id: input.data.shiftId,
        status: ShiftStatus.OPEN,
        register: { store: { businessId: request.auth!.businessId, ...(request.auth!.storeId ? { id: request.auth!.storeId } : {}) } }
      },
      include: { register: { include: { store: true } } }
    });
    if (!shift) throw new HttpError(404, "OPEN_SHIFT_NOT_FOUND", "Open a register before completing a sale.");
    if (request.auth!.role === Role.CASHIER && shift.cashierId !== request.auth!.userId) {
      throw new HttpError(403, "FORBIDDEN", "A cashier can sell only from their own shift.");
    }

    const products = await transaction.product.findMany({
      where: { id: { in: [...quantities.keys()] }, businessId: request.auth!.businessId, active: true }
    });
    if (products.length !== quantities.size) throw new HttpError(422, "PRODUCT_NOT_AVAILABLE", "One or more products are unavailable.");

    const productMap = new Map(products.map((product) => [product.id, product]));
    const items = [...quantities].map(([productId, quantity]) => {
      const product = productMap.get(productId)!;
      return {
        productId,
        productNameSnapshot: product.name,
        skuSnapshot: product.sku,
        quantity,
        unitPriceCents: product.priceCents,
        totalCents: product.priceCents * quantity
      };
    });
    const totalCents = items.reduce((sum, item) => sum + item.totalCents, 0);
    const tender = saleTenderDecision(totalCents, input.data.cashReceivedCents);
    if (!tender.sufficient) {
      throw new HttpError(422, "INSUFFICIENT_TENDER", "Cash received is lower than the sale total.");
    }

    const ledger = await transaction.ledgerEntry.aggregate({
      where: { shiftId: shift.id },
      _sum: { amountCents: true }
    });
    const expectedCashCents = ledger._sum.amountCents ?? 0;
    const limitDecision = cashLimitDecision(expectedCashCents, totalCents, shift.register.cashLimitCents);
    if (limitDecision.blocked) {
      throw new HttpError(
        409,
        "CASH_LIMIT_REACHED",
        "La venta rebasa el límite de efectivo del cajón. Solicita a un supervisor que selle una fajilla antes de continuar.",
        { expectedCashCents, projectedCashCents: limitDecision.projectedCashCents, cashLimitCents: shift.register.cashLimitCents }
      );
    }

    for (const [productId, quantity] of quantities) {
      if (!inventoryDecision(productMap.get(productId)!.stockQuantity, quantity).available) {
        throw new HttpError(409, "INSUFFICIENT_STOCK", `${productMap.get(productId)!.name} does not have enough stock.`);
      }
      const update = await transaction.product.updateMany({
        where: { id: productId, stockQuantity: { gte: quantity } },
        data: { stockQuantity: { decrement: quantity } }
      });
      if (update.count !== 1) throw new HttpError(409, "INSUFFICIENT_STOCK", `${productMap.get(productId)!.name} does not have enough stock.`);
    }

    const register = await transaction.register.update({
      where: { id: shift.registerId },
      data: { receiptSequence: { increment: 1 } }
    });
    const receiptNumber = `${shift.register.store.code}-${shift.register.code}-${String(register.receiptSequence).padStart(6, "0")}`;

    const sale = await transaction.sale.create({
      data: {
        businessId: request.auth!.businessId,
        shiftId: shift.id,
        cashierId: request.auth!.userId,
        receiptNumber,
        subtotalCents: totalCents,
        totalCents,
        items: { create: items },
        payments: { create: { method: "CASH", amountCents: totalCents } }
      },
      include: { items: true, payments: true }
    });

    await transaction.ledgerEntry.create({
      data: {
        businessId: request.auth!.businessId,
        shiftId: shift.id,
        type: "CASH_SALE",
        amountCents: totalCents,
        description: `Cash sale ${receiptNumber}`,
        sourceType: "SALE",
        sourceId: sale.id,
        createdById: request.auth!.userId
      }
    });
    await transaction.auditEvent.create({
      data: {
        businessId: request.auth!.businessId,
        storeId: shift.register.storeId,
        actorId: request.auth!.userId,
        action: "sale.completed",
        entityType: "SALE",
        entityId: sale.id,
        metadata: { receiptNumber, totalCents, itemCount: items.reduce((sum, item) => sum + item.quantity, 0) }
      }
    });

    return { sale, changeCents: tender.changeCents };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  response.status(201).json(result);
}));

export default router;
