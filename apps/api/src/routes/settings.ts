import { Role } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncRoute, HttpError, parseId } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireRole(Role.ADMIN));

router.get("/registers", asyncRoute(async (request, response) => {
  const registers = await prisma.register.findMany({
    where: { store: { businessId: request.auth!.businessId } },
    include: { store: { select: { id: true, name: true, code: true, city: true } } },
    orderBy: [{ store: { name: "asc" } }, { name: "asc" }]
  });
  response.json({ registers });
}));

const registerSettingsSchema = z.object({
  cashLimitCents: z.number().int().min(100_000).max(100_000_000),
  closingToleranceCents: z.number().int().min(0).max(100_000),
  supervisorCanManageBundles: z.boolean(),
  supervisorCanApproveClosures: z.boolean(),
  active: z.boolean()
});

router.patch("/registers/:id", asyncRoute(async (request, response) => {
  const registerId = parseId(request.params.id, "Register ID");
  const input = registerSettingsSchema.safeParse(request.body);
  if (!input.success) throw new HttpError(422, "VALIDATION_ERROR", "Revisa los límites configurados.", input.error.flatten());
  const existing = await prisma.register.findFirst({ where: { id: registerId, store: { businessId: request.auth!.businessId } } });
  if (!existing) throw new HttpError(404, "REGISTER_NOT_FOUND", "La caja no existe.");
  const register = await prisma.register.update({
    where: { id: registerId },
    data: input.data,
    include: { store: { select: { id: true, name: true, code: true, city: true } } }
  });
  await prisma.auditEvent.create({
    data: {
      businessId: request.auth!.businessId,
      storeId: register.storeId,
      actorId: request.auth!.userId,
      action: "register.controls_updated",
      entityType: "REGISTER",
      entityId: register.id,
      metadata: input.data
    }
  });
  response.json({ register });
}));

export default router;
