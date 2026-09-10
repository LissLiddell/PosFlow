import { Role, ShiftStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { calculateCashLines, closingDecision } from "../domain/cash.js";
import { canApproveCloseExceptions } from "../domain/permissions.js";
import { asyncRoute, HttpError, parseId } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const openSchema = z.object({
  registerId: z.string().uuid(),
  openingFloatCents: z.number().int().min(0).max(10_000_000)
});

const denominationSchema = z.object({
  denominationCents: z.number().int().positive(),
  quantity: z.number().int().min(0).max(1000)
});

const closeSchema = z.object({ lines: z.array(denominationSchema).max(20) });
const activeStatuses: ShiftStatus[] = [ShiftStatus.OPEN, ShiftStatus.PENDING_REVIEW];

function canOperateShift(role: Role) {
  return new Set<Role>([Role.SUPERVISOR, Role.CASHIER]).has(role);
}

router.get("/current", asyncRoute(async (request, response) => {
  const shift = await prisma.shift.findFirst({
    where: {
      status: { in: activeStatuses },
      register: {
        store: {
          businessId: request.auth!.businessId,
          ...(request.auth!.storeId ? { id: request.auth!.storeId } : {})
        }
      },
      ...(request.auth!.role === Role.CASHIER ? { cashierId: request.auth!.userId } : {})
    },
    include: {
      register: { include: { store: { select: { id: true, name: true, code: true, city: true } } } },
      cashier: { select: { id: true, name: true } },
      ledgerEntries: { orderBy: { createdAt: "asc" } },
      cashBundles: { include: { lines: true }, orderBy: { createdAt: "desc" } }
    },
    orderBy: { openedAt: "desc" }
  });

  if (!shift) {
    response.json({ shift: null });
    return;
  }

  response.json({
    shift: {
      ...shift,
      expectedCashCents: shift.ledgerEntries.reduce((sum, entry) => sum + entry.amountCents, 0)
    }
  });
}));

router.get("/pending-review", requireRole(Role.ADMIN, Role.SUPERVISOR), asyncRoute(async (request, response) => {
  const shifts = await prisma.shift.findMany({
    where: {
      status: ShiftStatus.PENDING_REVIEW,
      register: {
        ...(request.auth!.role === Role.SUPERVISOR ? { supervisorCanApproveClosures: true } : {}),
        store: {
          businessId: request.auth!.businessId,
          ...(request.auth!.storeId ? { id: request.auth!.storeId } : {})
        }
      }
    },
    include: {
      register: { include: { store: { select: { id: true, name: true, code: true, city: true } } } },
      cashier: { select: { id: true, name: true } },
      cashCounts: { where: { type: "CLOSING" }, include: { lines: true } }
    },
    orderBy: { closeRequestedAt: "asc" }
  });
  response.json({ shifts });
}));

router.post("/open", requireRole(Role.SUPERVISOR, Role.CASHIER), asyncRoute(async (request, response) => {
  const input = openSchema.safeParse(request.body);
  if (!input.success) throw new HttpError(422, "VALIDATION_ERROR", "Check the opening amount and register.", input.error.flatten());
  if (!canOperateShift(request.auth!.role)) throw new HttpError(403, "FORBIDDEN", "Your role cannot operate a register.");

  const result = await prisma.$transaction(async (transaction) => {
    const register = await transaction.register.findFirst({
      where: {
        id: input.data.registerId,
        active: true,
        store: {
          businessId: request.auth!.businessId,
          ...(request.auth!.storeId ? { id: request.auth!.storeId } : {})
        }
      },
      include: { store: true }
    });
    if (!register) throw new HttpError(404, "REGISTER_NOT_FOUND", "The selected register is not available.");

    const existing = await transaction.shift.findFirst({
      where: { registerId: register.id, status: { in: activeStatuses } }
    });
    if (existing) throw new HttpError(409, "REGISTER_ALREADY_OPEN", "This register already has an active shift.");

    const shift = await transaction.shift.create({
      data: {
        registerId: register.id,
        cashierId: request.auth!.userId,
        openingFloatCents: input.data.openingFloatCents
      }
    });

    await transaction.ledgerEntry.create({
      data: {
        businessId: request.auth!.businessId,
        shiftId: shift.id,
        type: "OPENING_FLOAT",
        amountCents: input.data.openingFloatCents,
        description: "Opening float",
        sourceType: "SHIFT",
        sourceId: shift.id,
        createdById: request.auth!.userId
      }
    });
    await transaction.auditEvent.create({
      data: {
        businessId: request.auth!.businessId,
        storeId: register.storeId,
        actorId: request.auth!.userId,
        action: "shift.opened",
        entityType: "SHIFT",
        entityId: shift.id,
        metadata: { openingFloatCents: input.data.openingFloatCents, registerCode: register.code }
      }
    });
    return shift;
  });

  response.status(201).json({ shift: result });
}));

router.post("/:id/close", requireRole(Role.SUPERVISOR, Role.CASHIER), asyncRoute(async (request, response) => {
  const shiftId = parseId(request.params.id, "Shift ID");
  const input = closeSchema.safeParse(request.body);
  if (!input.success) throw new HttpError(422, "VALIDATION_ERROR", "Check the cash-count lines.", input.error.flatten());

  let cash;
  try {
    cash = calculateCashLines(input.data.lines, { allowZero: true });
  } catch {
    throw new HttpError(422, "INVALID_CASH_COUNT", "Enter at least one supported denomination with a valid quantity.");
  }

  const result = await prisma.$transaction(async (transaction) => {
    const shift = await transaction.shift.findFirst({
      where: {
        id: shiftId,
        status: ShiftStatus.OPEN,
        register: { store: { businessId: request.auth!.businessId, ...(request.auth!.storeId ? { id: request.auth!.storeId } : {}) } }
      },
      include: { register: true }
    });
    if (!shift) throw new HttpError(404, "OPEN_SHIFT_NOT_FOUND", "The open shift was not found.");
    if (request.auth!.role === Role.CASHIER && shift.cashierId !== request.auth!.userId) {
      throw new HttpError(403, "FORBIDDEN", "A cashier can close only their own shift.");
    }

    const aggregate = await transaction.ledgerEntry.aggregate({
      where: { shiftId },
      _sum: { amountCents: true }
    });
    const expectedCashCents = aggregate._sum.amountCents ?? 0;
    const decision = closingDecision(expectedCashCents, cash.totalCents, shift.register.closingToleranceCents);
    // Closing and approving are intentionally separate actions. Even an authorized
    // supervisor must leave an out-of-tolerance count in the review queue first.
    const requiresReview = decision.requiresApproval;

    const existingCount = await transaction.cashCount.findUnique({
      where: { shiftId_type: { shiftId, type: "CLOSING" } }
    });
    if (existingCount) {
      await transaction.cashCountLine.deleteMany({ where: { cashCountId: existingCount.id } });
      await transaction.cashCount.update({
        where: { id: existingCount.id },
        data: {
          totalCents: cash.totalCents,
          countedById: request.auth!.userId,
          lines: { create: cash.lines }
        }
      });
    } else {
      await transaction.cashCount.create({
        data: {
          businessId: request.auth!.businessId,
          shiftId,
          type: "CLOSING",
          totalCents: cash.totalCents,
          countedById: request.auth!.userId,
          lines: { create: cash.lines }
        }
      });
    }

    const updated = await transaction.shift.update({
      where: { id: shiftId },
      data: {
        status: requiresReview ? ShiftStatus.PENDING_REVIEW : ShiftStatus.CLOSED,
        expectedCashCents,
        countedCashCents: cash.totalCents,
        discrepancyCents: decision.discrepancyCents,
        closeRequestedAt: new Date(),
        closedAt: requiresReview ? null : new Date(),
        closedById: requiresReview ? null : request.auth!.userId,
        closeApprovedById: null
      }
    });

    await transaction.auditEvent.create({
      data: {
        businessId: request.auth!.businessId,
        storeId: shift.register.storeId,
        actorId: request.auth!.userId,
        action: requiresReview ? "shift.close_requested" : "shift.closed",
        entityType: "SHIFT",
        entityId: shiftId,
        metadata: { expectedCashCents, countedCashCents: cash.totalCents, discrepancyCents: decision.discrepancyCents }
      }
    });

    return { shift: updated, requiresApproval: requiresReview };
  });

  response.status(result.requiresApproval ? 202 : 200).json(result);
}));

router.post("/:id/approve-close", requireRole(Role.ADMIN, Role.SUPERVISOR), asyncRoute(async (request, response) => {
  const shiftId = parseId(request.params.id, "Shift ID");
  const updated = await prisma.$transaction(async (transaction) => {
    const shift = await transaction.shift.findFirst({
      where: {
        id: shiftId,
        status: ShiftStatus.PENDING_REVIEW,
        register: { store: { businessId: request.auth!.businessId, ...(request.auth!.storeId ? { id: request.auth!.storeId } : {}) } }
      },
      include: { register: true }
    });
    if (!shift) throw new HttpError(404, "SHIFT_REVIEW_NOT_FOUND", "No pending close was found.");
    if (!canApproveCloseExceptions(request.auth!.role, shift.register)) {
      throw new HttpError(403, "SUPERVISOR_PERMISSION_DISABLED", "An administrator has not delegated close approval for this register.");
    }

    const closed = await transaction.shift.update({
      where: { id: shiftId },
      data: {
        status: ShiftStatus.CLOSED,
        closedAt: new Date(),
        closedById: shift.cashierId,
        closeApprovedById: request.auth!.userId
      }
    });
    await transaction.auditEvent.create({
      data: {
        businessId: request.auth!.businessId,
        storeId: shift.register.storeId,
        actorId: request.auth!.userId,
        action: "shift.close_approved",
        entityType: "SHIFT",
        entityId: shift.id,
        metadata: { discrepancyCents: shift.discrepancyCents }
      }
    });
    return closed;
  });
  response.json({ shift: updated });
}));

export default router;
