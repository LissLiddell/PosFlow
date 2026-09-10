import { randomUUID } from "node:crypto";
import { AdvanceSettlementType, AdvanceStatus, Role, ShiftStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { advanceCashImpact, advanceSettlementDecision } from "../domain/advances.js";
import { cashLimitDecision } from "../domain/cash.js";
import { asyncRoute, HttpError, parseId } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  storeId: z.string().uuid(),
  recipientType: z.enum(["EMPLOYEE", "VENDOR"]),
  recipientName: z.string().trim().min(2).max(100),
  purpose: z.string().trim().min(8).max(240),
  amountCents: z.number().int().min(1_00).max(5_000_000),
  dueDate: z.coerce.date()
});
const issueSchema = z.object({ shiftId: z.string().uuid() });
const settlementSchema = z.object({
  amountCents: z.number().int().positive().max(5_000_000),
  description: z.string().trim().min(3).max(240)
});
const cashReturnSchema = settlementSchema.extend({ shiftId: z.string().uuid() });
const activeSettlementStatuses: AdvanceStatus[] = [AdvanceStatus.OPEN, AdvanceStatus.PARTIALLY_SETTLED];

const advanceInclude = {
  store: { select: { id: true, name: true, code: true, city: true } },
  createdBy: { select: { id: true, name: true } },
  authorizedBy: { select: { id: true, name: true } },
  issuedBy: { select: { id: true, name: true } },
  settlements: {
    include: { createdBy: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: "desc" as const }
  }
} as const;

function advanceReference() {
  return `AV-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}

async function authorizedOpenShift(
  transaction: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  shiftId: string,
  businessId: string,
  storeId: string | undefined,
  userId: string,
  role: Role
) {
  const shift = await transaction.shift.findFirst({
    where: {
      id: shiftId,
      status: ShiftStatus.OPEN,
      register: { store: { businessId, ...(storeId ? { id: storeId } : {}) } }
    },
    include: { register: true }
  });
  if (!shift) throw new HttpError(404, "OPEN_SHIFT_NOT_FOUND", "No existe un turno abierto autorizado para operar el anticipo.");
  if (role === Role.CASHIER && shift.cashierId !== userId) {
    throw new HttpError(403, "FORBIDDEN", "El cajero sólo puede operar anticipos dentro de su propio turno.");
  }
  return shift;
}

router.get("/stores", asyncRoute(async (request, response) => {
  const stores = await prisma.store.findMany({
    where: { businessId: request.auth!.businessId },
    select: { id: true, name: true, code: true, city: true },
    orderBy: { name: "asc" }
  });
  response.json({ stores });
}));

router.get("/", asyncRoute(async (request, response) => {
  const advances = await prisma.advance.findMany({
    where: {
      businessId: request.auth!.businessId,
      ...(request.auth!.storeId ? { storeId: request.auth!.storeId } : {})
    },
    include: advanceInclude,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    take: 80
  });
  response.json({ advances });
}));

router.post("/", requireRole(Role.FINANCE, Role.ADMIN), asyncRoute(async (request, response) => {
  const input = createSchema.safeParse(request.body);
  if (!input.success) throw new HttpError(422, "VALIDATION_ERROR", "Revisa la persona, el motivo, el importe y la fecha límite.", input.error.flatten());
  if (input.data.dueDate.getTime() < new Date().setHours(0, 0, 0, 0)) {
    throw new HttpError(422, "INVALID_DUE_DATE", "La fecha límite no puede estar en el pasado.");
  }

  const store = await prisma.store.findFirst({ where: { id: input.data.storeId, businessId: request.auth!.businessId } });
  if (!store) throw new HttpError(404, "STORE_NOT_FOUND", "La tienda seleccionada no pertenece a esta empresa.");

  const advance = await prisma.$transaction(async (transaction) => {
    const created = await transaction.advance.create({
      data: {
        businessId: request.auth!.businessId,
        storeId: store.id,
        reference: advanceReference(),
        recipientType: input.data.recipientType,
        recipientName: input.data.recipientName,
        purpose: input.data.purpose,
        amountCents: input.data.amountCents,
        dueDate: input.data.dueDate,
        createdById: request.auth!.userId,
        authorizedById: request.auth!.userId
      }
    });
    await transaction.auditEvent.create({
      data: {
        businessId: request.auth!.businessId,
        storeId: store.id,
        actorId: request.auth!.userId,
        action: "advance.authorized",
        entityType: "ADVANCE",
        entityId: created.id,
        metadata: { reference: created.reference, recipientName: created.recipientName, amountCents: created.amountCents, dueDate: created.dueDate }
      }
    });
    return transaction.advance.findUniqueOrThrow({ where: { id: created.id }, include: advanceInclude });
  });
  response.status(201).json({ advance });
}));

router.post("/:id/issue", requireRole(Role.CASHIER, Role.SUPERVISOR), asyncRoute(async (request, response) => {
  const advanceId = parseId(request.params.id, "Advance ID");
  const input = issueSchema.safeParse(request.body);
  if (!input.success) throw new HttpError(422, "VALIDATION_ERROR", "Selecciona un turno abierto válido.", input.error.flatten());

  const advance = await prisma.$transaction(async (transaction) => {
    const shift = await authorizedOpenShift(transaction, input.data.shiftId, request.auth!.businessId, request.auth!.storeId, request.auth!.userId, request.auth!.role);
    const current = await transaction.advance.findFirst({ where: { id: advanceId, businessId: request.auth!.businessId } });
    if (!current) throw new HttpError(404, "ADVANCE_NOT_FOUND", "No encontramos el anticipo.");
    if (current.storeId !== shift.register.storeId) throw new HttpError(403, "WRONG_STORE", "Este anticipo fue autorizado para otra tienda.");
    if (current.status !== AdvanceStatus.AUTHORIZED) throw new HttpError(409, "ADVANCE_NOT_AUTHORIZED", "El anticipo ya fue entregado o dejó de estar autorizado.");

    const drawer = await transaction.ledgerEntry.aggregate({ where: { shiftId: shift.id }, _sum: { amountCents: true } });
    const expectedCashCents = drawer._sum.amountCents ?? 0;
    if (expectedCashCents < current.amountCents) {
      throw new HttpError(409, "INSUFFICIENT_DRAWER_CASH", "La caja no tiene efectivo esperado suficiente para entregar este anticipo.", { expectedCashCents, requiredCashCents: current.amountCents });
    }

    const claimed = await transaction.advance.updateMany({
      where: { id: current.id, version: current.version, status: AdvanceStatus.AUTHORIZED },
      data: {
        status: AdvanceStatus.OPEN,
        issuedShiftId: shift.id,
        issuedById: request.auth!.userId,
        issuedAt: new Date(),
        version: { increment: 1 }
      }
    });
    if (claimed.count !== 1) throw new HttpError(409, "ADVANCE_ALREADY_ISSUED", "Otra caja ya entregó este anticipo.");

    await transaction.ledgerEntry.create({
      data: {
        businessId: request.auth!.businessId,
        shiftId: shift.id,
        type: "ADVANCE_ISSUED",
        amountCents: advanceCashImpact("ISSUE", current.amountCents),
        description: `Anticipo ${current.reference} entregado a ${current.recipientName}`,
        sourceType: "ADVANCE",
        sourceId: current.id,
        createdById: request.auth!.userId
      }
    });
    await transaction.auditEvent.create({
      data: {
        businessId: request.auth!.businessId,
        storeId: current.storeId,
        actorId: request.auth!.userId,
        action: "advance.issued",
        entityType: "ADVANCE",
        entityId: current.id,
        metadata: { reference: current.reference, amountCents: current.amountCents, shiftId: shift.id }
      }
    });
    return transaction.advance.findUniqueOrThrow({ where: { id: current.id }, include: advanceInclude });
  });
  response.json({ advance });
}));

router.post("/:id/proof", requireRole(Role.FINANCE, Role.ADMIN), asyncRoute(async (request, response) => {
  const advanceId = parseId(request.params.id, "Advance ID");
  const input = settlementSchema.safeParse(request.body);
  if (!input.success) throw new HttpError(422, "VALIDATION_ERROR", "Ingresa un importe y una descripción válidos.", input.error.flatten());

  const advance = await prisma.$transaction(async (transaction) => {
    const current = await transaction.advance.findFirst({ where: { id: advanceId, businessId: request.auth!.businessId } });
    if (!current) throw new HttpError(404, "ADVANCE_NOT_FOUND", "No encontramos el anticipo.");
    if (!activeSettlementStatuses.includes(current.status)) throw new HttpError(409, "ADVANCE_NOT_OPEN", "El anticipo debe estar entregado y pendiente para agregar comprobaciones.");

    let decision;
    try {
      decision = advanceSettlementDecision(current.amountCents, current.proofCents, current.returnedCents, "EXPENSE_PROOF", input.data.amountCents);
    } catch (error) {
      if (error instanceof Error && error.message === "SETTLEMENT_EXCEEDS_OUTSTANDING") {
        throw new HttpError(409, "SETTLEMENT_EXCEEDS_OUTSTANDING", "La comprobación supera el saldo pendiente del anticipo.");
      }
      throw error;
    }

    const claimed = await transaction.advance.updateMany({
      where: { id: current.id, version: current.version, status: { in: activeSettlementStatuses } },
      data: {
        proofCents: { increment: input.data.amountCents },
        status: decision.status,
        settledAt: decision.status === "SETTLED" ? new Date() : null,
        version: { increment: 1 }
      }
    });
    if (claimed.count !== 1) throw new HttpError(409, "ADVANCE_CHANGED", "El anticipo cambió mientras lo revisabas. Actualiza e intenta nuevamente.");

    await transaction.advanceSettlement.create({
      data: {
        businessId: request.auth!.businessId,
        advanceId: current.id,
        type: AdvanceSettlementType.EXPENSE_PROOF,
        amountCents: input.data.amountCents,
        description: input.data.description,
        createdById: request.auth!.userId
      }
    });
    await transaction.auditEvent.create({
      data: {
        businessId: request.auth!.businessId,
        storeId: current.storeId,
        actorId: request.auth!.userId,
        action: "advance.proof_recorded",
        entityType: "ADVANCE",
        entityId: current.id,
        metadata: { amountCents: input.data.amountCents, outstandingCents: decision.nextOutstandingCents, description: input.data.description }
      }
    });
    return transaction.advance.findUniqueOrThrow({ where: { id: current.id }, include: advanceInclude });
  });
  response.json({ advance });
}));

router.post("/:id/return", requireRole(Role.CASHIER, Role.SUPERVISOR), asyncRoute(async (request, response) => {
  const advanceId = parseId(request.params.id, "Advance ID");
  const input = cashReturnSchema.safeParse(request.body);
  if (!input.success) throw new HttpError(422, "VALIDATION_ERROR", "Ingresa el importe devuelto, el motivo y un turno válido.", input.error.flatten());

  const advance = await prisma.$transaction(async (transaction) => {
    const shift = await authorizedOpenShift(transaction, input.data.shiftId, request.auth!.businessId, request.auth!.storeId, request.auth!.userId, request.auth!.role);
    const current = await transaction.advance.findFirst({ where: { id: advanceId, businessId: request.auth!.businessId } });
    if (!current) throw new HttpError(404, "ADVANCE_NOT_FOUND", "No encontramos el anticipo.");
    if (current.storeId !== shift.register.storeId) throw new HttpError(403, "WRONG_STORE", "Este anticipo pertenece a otra tienda.");
    if (!activeSettlementStatuses.includes(current.status)) throw new HttpError(409, "ADVANCE_NOT_OPEN", "El anticipo no acepta devoluciones en su estado actual.");

    let decision;
    try {
      decision = advanceSettlementDecision(current.amountCents, current.proofCents, current.returnedCents, "CASH_RETURN", input.data.amountCents);
    } catch (error) {
      if (error instanceof Error && error.message === "SETTLEMENT_EXCEEDS_OUTSTANDING") {
        throw new HttpError(409, "SETTLEMENT_EXCEEDS_OUTSTANDING", "La devolución supera el saldo pendiente del anticipo.");
      }
      throw error;
    }

    const drawer = await transaction.ledgerEntry.aggregate({ where: { shiftId: shift.id }, _sum: { amountCents: true } });
    const expectedCashCents = drawer._sum.amountCents ?? 0;
    const limit = cashLimitDecision(expectedCashCents, input.data.amountCents, shift.register.cashLimitCents);
    if (limit.blocked) {
      throw new HttpError(409, "CASH_LIMIT_EXCEEDED", "La devolución rebasaría el límite del cajón. Solicita una fajilla antes de recibirla.", {
        expectedCashCents,
        projectedCashCents: limit.projectedCashCents,
        cashLimitCents: shift.register.cashLimitCents
      });
    }

    const claimed = await transaction.advance.updateMany({
      where: { id: current.id, version: current.version, status: { in: activeSettlementStatuses } },
      data: {
        returnedCents: { increment: input.data.amountCents },
        status: decision.status,
        settledAt: decision.status === "SETTLED" ? new Date() : null,
        version: { increment: 1 }
      }
    });
    if (claimed.count !== 1) throw new HttpError(409, "ADVANCE_CHANGED", "El anticipo cambió mientras recibías el efectivo. Actualiza e intenta nuevamente.");

    await transaction.advanceSettlement.create({
      data: {
        businessId: request.auth!.businessId,
        advanceId: current.id,
        type: AdvanceSettlementType.CASH_RETURN,
        amountCents: input.data.amountCents,
        description: input.data.description,
        shiftId: shift.id,
        createdById: request.auth!.userId
      }
    });
    await transaction.ledgerEntry.create({
      data: {
        businessId: request.auth!.businessId,
        shiftId: shift.id,
        type: "ADVANCE_RETURNED",
        amountCents: advanceCashImpact("RETURN", input.data.amountCents),
        description: `Devolución de anticipo ${current.reference}: ${input.data.description}`,
        sourceType: "ADVANCE",
        sourceId: current.id,
        createdById: request.auth!.userId
      }
    });
    await transaction.auditEvent.create({
      data: {
        businessId: request.auth!.businessId,
        storeId: current.storeId,
        actorId: request.auth!.userId,
        action: "advance.cash_returned",
        entityType: "ADVANCE",
        entityId: current.id,
        metadata: { amountCents: input.data.amountCents, outstandingCents: decision.nextOutstandingCents, shiftId: shift.id, description: input.data.description }
      }
    });
    return transaction.advance.findUniqueOrThrow({ where: { id: current.id }, include: advanceInclude });
  });
  response.json({ advance });
}));

export default router;
