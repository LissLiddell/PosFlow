import { randomUUID } from "node:crypto";
import { CashBundleStatus, Role, ShiftStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { calculateCashLines } from "../domain/cash.js";
import { canManageCashBundles } from "../domain/permissions.js";
import { asyncRoute, HttpError, parseId } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const denominationSchema = z.object({ denominationCents: z.number().int().positive(), quantity: z.number().int().min(0).max(1000) });
const bundleSchema = z.object({ shiftId: z.string().uuid(), lines: z.array(denominationSchema).min(1).max(20) });
const updateSchema = z.object({ lines: z.array(denominationSchema).min(1).max(20) });

function calculateOrThrow(lines: Array<{ denominationCents: number; quantity: number }>) {
  try {
    return calculateCashLines(lines);
  } catch {
    throw new HttpError(422, "INVALID_CASH_BUNDLE", "Enter at least one supported denomination with a valid quantity.");
  }
}

function assertCanManageBundles(role: Role, register: { supervisorCanManageBundles: boolean }) {
  if (!canManageCashBundles(role, register)) {
    throw new HttpError(403, "SUPERVISOR_PERMISSION_DISABLED", "An administrator has not delegated cash-bundle management for this register.");
  }
}

async function findBundle(id: string, businessId: string, storeId?: string) {
  const bundle = await prisma.cashBundle.findFirst({
    where: { id, businessId, ...(storeId ? { shift: { register: { storeId } } } : {}) },
    include: { lines: true, shift: { include: { register: true } }, preparedBy: { select: { name: true } }, verifiedBy: { select: { name: true } } }
  });
  if (!bundle) throw new HttpError(404, "CASH_BUNDLE_NOT_FOUND", "The cash bundle was not found.");
  return bundle;
}

router.get("/", requireRole(Role.ADMIN, Role.SUPERVISOR), asyncRoute(async (request, response) => {
  const shiftId = z.string().uuid().safeParse(request.query.shiftId);
  if (!shiftId.success) throw new HttpError(400, "INVALID_SHIFT_ID", "Provide a valid shift ID.");
  const shift = await prisma.shift.findFirst({
    where: { id: shiftId.data, register: { store: { businessId: request.auth!.businessId, ...(request.auth!.storeId ? { id: request.auth!.storeId } : {}) } } },
    include: { register: true }
  });
  if (!shift) throw new HttpError(404, "SHIFT_NOT_FOUND", "The shift was not found.");
  assertCanManageBundles(request.auth!.role, shift.register);
  const bundles = await prisma.cashBundle.findMany({
    where: { businessId: request.auth!.businessId, shiftId: shiftId.data },
    include: { lines: true, preparedBy: { select: { name: true } }, verifiedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" }
  });
  response.json({ bundles });
}));

router.post("/", requireRole(Role.ADMIN, Role.SUPERVISOR), asyncRoute(async (request, response) => {
  const input = bundleSchema.safeParse(request.body);
  if (!input.success) throw new HttpError(422, "VALIDATION_ERROR", "Check the denomination lines.", input.error.flatten());
  const cash = calculateOrThrow(input.data.lines);

  const shift = await prisma.shift.findFirst({
    where: { id: input.data.shiftId, status: ShiftStatus.OPEN, register: { store: { businessId: request.auth!.businessId, ...(request.auth!.storeId ? { id: request.auth!.storeId } : {}) } } },
    include: { register: true }
  });
  if (!shift) throw new HttpError(404, "OPEN_SHIFT_NOT_FOUND", "The open shift was not found.");
  assertCanManageBundles(request.auth!.role, shift.register);
  const reference = `FJ-${randomUUID().slice(0, 8).toUpperCase()}`;
  const bundle = await prisma.cashBundle.create({
    data: {
      businessId: request.auth!.businessId,
      shiftId: shift.id,
      reference,
      totalCents: cash.totalCents,
      preparedById: request.auth!.userId,
      lines: { create: cash.lines }
    },
    include: { lines: true }
  });
  response.status(201).json({ bundle });
}));

router.patch("/:id", requireRole(Role.ADMIN, Role.SUPERVISOR), asyncRoute(async (request, response) => {
  const bundleId = parseId(request.params.id, "Cash bundle ID");
  const input = updateSchema.safeParse(request.body);
  if (!input.success) throw new HttpError(422, "VALIDATION_ERROR", "Check the denomination lines.", input.error.flatten());
  const cash = calculateOrThrow(input.data.lines);
  const existing = await findBundle(bundleId, request.auth!.businessId, request.auth!.storeId);
  assertCanManageBundles(request.auth!.role, existing.shift.register);
  if (existing.status !== CashBundleStatus.DRAFT) throw new HttpError(409, "BUNDLE_IMMUTABLE", "A sealed bundle cannot be edited.");
  const bundle = await prisma.cashBundle.update({
    where: { id: bundleId },
    data: {
      totalCents: cash.totalCents,
      lines: { deleteMany: {}, create: cash.lines }
    },
    include: { lines: true }
  });
  response.json({ bundle });
}));

router.post("/:id/seal", requireRole(Role.ADMIN, Role.SUPERVISOR), asyncRoute(async (request, response) => {
  const bundleId = parseId(request.params.id, "Cash bundle ID");
  const bundle = await findBundle(bundleId, request.auth!.businessId, request.auth!.storeId);
  assertCanManageBundles(request.auth!.role, bundle.shift.register);
  if (bundle.status !== CashBundleStatus.DRAFT) throw new HttpError(409, "BUNDLE_IMMUTABLE", "This bundle is no longer a draft.");
  if (bundle.shift.status !== ShiftStatus.OPEN) throw new HttpError(409, "SHIFT_NOT_OPEN", "Bundles can be sealed only during an open shift.");
  const sealed = await prisma.$transaction(async (transaction) => {
    const aggregate = await transaction.ledgerEntry.aggregate({ where: { shiftId: bundle.shiftId }, _sum: { amountCents: true } });
    const expectedCashCents = aggregate._sum.amountCents ?? 0;
    if (bundle.totalCents > expectedCashCents) throw new HttpError(422, "INSUFFICIENT_DRAWER_CASH", "The bundle is greater than the expected drawer cash.");

    const updated = await transaction.cashBundle.update({
      where: { id: bundle.id },
      data: {
        status: CashBundleStatus.SEALED,
        sealedAt: new Date(),
        verifiedById: request.auth!.userId
      },
      include: { lines: true }
    });
    await transaction.ledgerEntry.create({
      data: {
        businessId: request.auth!.businessId,
        shiftId: bundle.shiftId,
        type: "CASH_BUNDLE_SEALED",
        amountCents: -bundle.totalCents,
        description: `Sealed cash bundle ${bundle.reference}`,
        sourceType: "CASH_BUNDLE",
        sourceId: bundle.id,
        createdById: request.auth!.userId
      }
    });
    await transaction.auditEvent.create({
      data: {
        businessId: request.auth!.businessId,
        storeId: bundle.shift.register.storeId,
        actorId: request.auth!.userId,
        action: "cash_bundle.sealed",
        entityType: "CASH_BUNDLE",
        entityId: bundle.id,
        metadata: { reference: bundle.reference, totalCents: bundle.totalCents }
      }
    });
    return updated;
  });
  response.json({ bundle: sealed });
}));

export default router;
