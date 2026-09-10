import { randomUUID } from "node:crypto";
import { RemittanceStatus, Role, ShiftStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { cashLimitDecision } from "../domain/cash.js";
import { remittancePayoutImpact, remittanceSendImpact } from "../domain/remittances.js";
import { asyncRoute, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const sendSchema = z.object({
  shiftId: z.string().uuid(),
  destinationStoreId: z.string().uuid(),
  senderName: z.string().trim().min(2).max(80),
  senderPhone: z.string().trim().regex(/^[0-9+() -]{7,20}$/).optional().or(z.literal("")),
  beneficiaryName: z.string().trim().min(2).max(80),
  beneficiaryDocumentCode: z.string().regex(/^\d{4}$/),
  amountCents: z.number().int().min(10_000).max(2_000_000)
});

const payoutSchema = z.object({
  shiftId: z.string().uuid(),
  beneficiaryDocumentCode: z.string().regex(/^\d{4}$/)
});

const remittanceInclude = {
  originStore: { select: { id: true, name: true, code: true, city: true } },
  destinationStore: { select: { id: true, name: true, code: true, city: true } },
  sentBy: { select: { id: true, name: true } },
  paidBy: { select: { id: true, name: true } }
} as const;

function requireOperationalRole(role: Role) {
  if (role !== Role.CASHIER && role !== Role.SUPERVISOR) {
    throw new HttpError(403, "FORBIDDEN", "This role cannot operate customer remittances.");
  }
}

function remittanceReference() {
  return `RM-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}

router.get("/destinations", asyncRoute(async (request, response) => {
  const stores = await prisma.store.findMany({
    where: {
      businessId: request.auth!.businessId,
      ...(request.auth!.storeId ? { id: { not: request.auth!.storeId } } : {})
    },
    select: { id: true, name: true, code: true, city: true },
    orderBy: { name: "asc" }
  });
  response.json({ stores });
}));

router.get("/", asyncRoute(async (request, response) => {
  const remittances = await prisma.remittance.findMany({
    where: {
      businessId: request.auth!.businessId,
      ...(request.auth!.storeId ? {
        OR: [
          { originStoreId: request.auth!.storeId },
          { destinationStoreId: request.auth!.storeId }
        ]
      } : {})
    },
    include: remittanceInclude,
    orderBy: { createdAt: "desc" },
    take: 40
  });
  response.json({ remittances });
}));

router.post("/send", requireRole(Role.CASHIER, Role.SUPERVISOR), asyncRoute(async (request, response) => {
  requireOperationalRole(request.auth!.role);
  const input = sendSchema.safeParse(request.body);
  if (!input.success) throw new HttpError(422, "VALIDATION_ERROR", "Revisa los datos del remitente, beneficiario e importe.", input.error.flatten());

  const result = await prisma.$transaction(async (transaction) => {
    const shift = await transaction.shift.findFirst({
      where: {
        id: input.data.shiftId,
        status: ShiftStatus.OPEN,
        register: {
          store: {
            businessId: request.auth!.businessId,
            ...(request.auth!.storeId ? { id: request.auth!.storeId } : {})
          }
        }
      },
      include: { register: true }
    });
    if (!shift) throw new HttpError(404, "OPEN_SHIFT_NOT_FOUND", "No existe un turno abierto autorizado para registrar la remesa.");
    if (request.auth!.role === Role.CASHIER && shift.cashierId !== request.auth!.userId) {
      throw new HttpError(403, "FORBIDDEN", "El cajero sólo puede operar su propio turno.");
    }
    if (shift.register.storeId === input.data.destinationStoreId) {
      throw new HttpError(422, "SAME_STORE_REMITTANCE", "Selecciona una sucursal de destino distinta.");
    }

    const destination = await transaction.store.findFirst({
      where: { id: input.data.destinationStoreId, businessId: request.auth!.businessId }
    });
    if (!destination) throw new HttpError(404, "DESTINATION_NOT_FOUND", "La sucursal de destino no pertenece a esta red.");

    const impact = remittanceSendImpact(input.data.amountCents);
    const drawer = await transaction.ledgerEntry.aggregate({ where: { shiftId: shift.id }, _sum: { amountCents: true } });
    const expectedCashCents = drawer._sum.amountCents ?? 0;
    const limit = cashLimitDecision(expectedCashCents, impact.drawerImpactCents, shift.register.cashLimitCents);
    if (limit.blocked) {
      throw new HttpError(409, "CASH_LIMIT_EXCEEDED", "La remesa rebasaría el límite del cajón. Solicita una fajilla antes de continuar.", {
        expectedCashCents,
        projectedCashCents: limit.projectedCashCents,
        cashLimitCents: shift.register.cashLimitCents
      });
    }

    const remittance = await transaction.remittance.create({
      data: {
        businessId: request.auth!.businessId,
        reference: remittanceReference(),
        originStoreId: shift.register.storeId,
        destinationStoreId: destination.id,
        senderName: input.data.senderName,
        senderPhone: input.data.senderPhone || null,
        beneficiaryName: input.data.beneficiaryName,
        beneficiaryDocumentCode: input.data.beneficiaryDocumentCode,
        amountCents: input.data.amountCents,
        feeCents: impact.feeCents,
        totalCollectedCents: impact.totalCollectedCents,
        sentShiftId: shift.id,
        sentById: request.auth!.userId
      }
    });

    await transaction.ledgerEntry.create({
      data: {
        businessId: request.auth!.businessId,
        shiftId: shift.id,
        type: "REMITTANCE_SEND",
        amountCents: impact.drawerImpactCents,
        description: `Remesa enviada ${remittance.reference}: principal más comisión`,
        sourceType: "REMITTANCE",
        sourceId: remittance.id,
        createdById: request.auth!.userId
      }
    });
    await transaction.fundingEntry.create({
      data: {
        businessId: request.auth!.businessId,
        storeId: shift.register.storeId,
        remittanceId: remittance.id,
        type: "REMITTANCE_SEND",
        amountCents: impact.fundingImpactCents,
        description: `Obligación de pago por ${remittance.reference}`,
        createdById: request.auth!.userId
      }
    });
    await transaction.auditEvent.create({
      data: {
        businessId: request.auth!.businessId,
        storeId: shift.register.storeId,
        actorId: request.auth!.userId,
        action: "remittance.sent",
        entityType: "REMITTANCE",
        entityId: remittance.id,
        metadata: { reference: remittance.reference, amountCents: remittance.amountCents, feeCents: remittance.feeCents, destinationStoreId: destination.id }
      }
    });

    return transaction.remittance.findUniqueOrThrow({ where: { id: remittance.id }, include: remittanceInclude });
  });

  response.status(201).json({ remittance: result });
}));

router.post("/:reference/pay", requireRole(Role.CASHIER, Role.SUPERVISOR), asyncRoute(async (request, response) => {
  requireOperationalRole(request.auth!.role);
  const input = payoutSchema.safeParse(request.body);
  if (!input.success) throw new HttpError(422, "VALIDATION_ERROR", "Revisa la referencia, el turno y la validación del beneficiario.", input.error.flatten());
  const referenceInput = z.string().trim().min(1).max(40).safeParse(request.params.reference);
  if (!referenceInput.success) throw new HttpError(400, "INVALID_REFERENCE", "Ingresa una referencia válida.");
  const reference = referenceInput.data.toUpperCase();

  const result = await prisma.$transaction(async (transaction) => {
    const shift = await transaction.shift.findFirst({
      where: {
        id: input.data.shiftId,
        status: ShiftStatus.OPEN,
        register: {
          store: {
            businessId: request.auth!.businessId,
            ...(request.auth!.storeId ? { id: request.auth!.storeId } : {})
          }
        }
      },
      include: { register: true }
    });
    if (!shift) throw new HttpError(404, "OPEN_SHIFT_NOT_FOUND", "No existe un turno abierto autorizado para pagar la remesa.");
    if (request.auth!.role === Role.CASHIER && shift.cashierId !== request.auth!.userId) {
      throw new HttpError(403, "FORBIDDEN", "El cajero sólo puede operar su propio turno.");
    }

    const remittance = await transaction.remittance.findFirst({
      where: { businessId: request.auth!.businessId, reference },
      include: remittanceInclude
    });
    if (!remittance) throw new HttpError(404, "REMITTANCE_NOT_FOUND", "No encontramos una remesa con esa referencia.");
    if (remittance.status !== RemittanceStatus.AVAILABLE) {
      throw new HttpError(409, "REMITTANCE_NOT_AVAILABLE", "La remesa ya fue pagada o dejó de estar disponible.");
    }
    if (remittance.destinationStoreId !== shift.register.storeId) {
      throw new HttpError(403, "WRONG_DESTINATION", "Esta remesa debe pagarse en la sucursal de destino indicada.");
    }
    if (remittance.beneficiaryDocumentCode !== input.data.beneficiaryDocumentCode) {
      throw new HttpError(422, "BENEFICIARY_MISMATCH", "La validación del beneficiario no coincide.");
    }

    const drawer = await transaction.ledgerEntry.aggregate({ where: { shiftId: shift.id }, _sum: { amountCents: true } });
    const expectedCashCents = drawer._sum.amountCents ?? 0;
    if (expectedCashCents < remittance.amountCents) {
      throw new HttpError(409, "INSUFFICIENT_DRAWER_CASH", "La caja no tiene efectivo esperado suficiente para pagar esta remesa.", { expectedCashCents, requiredCashCents: remittance.amountCents });
    }

    const claimed = await transaction.remittance.updateMany({
      where: { id: remittance.id, status: RemittanceStatus.AVAILABLE },
      data: { status: RemittanceStatus.PAID, paidShiftId: shift.id, paidById: request.auth!.userId, paidAt: new Date() }
    });
    if (claimed.count !== 1) throw new HttpError(409, "REMITTANCE_ALREADY_PAID", "Otra caja ya pagó esta remesa.");

    const impact = remittancePayoutImpact(remittance.amountCents);
    await transaction.ledgerEntry.create({
      data: {
        businessId: request.auth!.businessId,
        shiftId: shift.id,
        type: "REMITTANCE_PAYOUT",
        amountCents: impact.drawerImpactCents,
        description: `Pago de remesa ${remittance.reference}`,
        sourceType: "REMITTANCE",
        sourceId: remittance.id,
        createdById: request.auth!.userId
      }
    });
    await transaction.fundingEntry.create({
      data: {
        businessId: request.auth!.businessId,
        storeId: shift.register.storeId,
        remittanceId: remittance.id,
        type: "REMITTANCE_PAYOUT",
        amountCents: impact.fundingImpactCents,
        description: `Derecho de liquidación por ${remittance.reference}`,
        createdById: request.auth!.userId
      }
    });
    await transaction.auditEvent.create({
      data: {
        businessId: request.auth!.businessId,
        storeId: shift.register.storeId,
        actorId: request.auth!.userId,
        action: "remittance.paid",
        entityType: "REMITTANCE",
        entityId: remittance.id,
        metadata: { reference: remittance.reference, amountCents: remittance.amountCents, shiftId: shift.id }
      }
    });

    return transaction.remittance.findUniqueOrThrow({ where: { id: remittance.id }, include: remittanceInclude });
  });

  response.json({ remittance: result });
}));

export default router;
