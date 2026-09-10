import { Role } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncRoute, HttpError, parseId } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/registers", asyncRoute(async (request, response) => {
  const registers = await prisma.register.findMany({
    where: {
      active: true,
      store: {
        businessId: request.auth!.businessId,
        ...(request.auth!.storeId ? { id: request.auth!.storeId } : {})
      }
    },
    include: {
      store: { select: { id: true, name: true, code: true, city: true } },
      shifts: {
        where: { status: { in: ["OPEN", "PENDING_REVIEW"] } },
        select: { id: true, status: true, cashier: { select: { name: true } } },
        take: 1
      }
    },
    orderBy: [{ store: { name: "asc" } }, { name: "asc" }]
  });
  response.json({
    registers: registers.map(({ shifts, ...register }) => ({ ...register, currentShift: shifts[0] ?? null }))
  });
}));

router.get("/products", asyncRoute(async (request, response) => {
  const products = await prisma.product.findMany({
    where: { businessId: request.auth!.businessId, ...(request.auth!.role === Role.ADMIN ? {} : { active: true }) },
    include: { category: { select: { id: true, name: true, color: true } } },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }]
  });
  response.json({ products });
}));

router.get("/categories", requireRole(Role.ADMIN), asyncRoute(async (request, response) => {
  const categories = await prisma.category.findMany({
    where: { businessId: request.auth!.businessId },
    orderBy: { name: "asc" }
  });
  response.json({ categories });
}));

const productSchema = z.object({
  categoryId: z.string().uuid(),
  sku: z.string().trim().min(2).max(32).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(100),
  priceCents: z.number().int().positive().max(100_000_000),
  stockQuantity: z.number().int().min(0).max(1_000_000),
  active: z.boolean().default(true)
});

router.post("/products", requireRole(Role.ADMIN), asyncRoute(async (request, response) => {
  const input = productSchema.safeParse(request.body);
  if (!input.success) throw new HttpError(422, "VALIDATION_ERROR", "Revisa los datos obligatorios del producto.", input.error.flatten());
  const category = await prisma.category.findFirst({ where: { id: input.data.categoryId, businessId: request.auth!.businessId } });
  if (!category) throw new HttpError(404, "CATEGORY_NOT_FOUND", "La categoría seleccionada no existe.");
  const duplicate = await prisma.product.findUnique({ where: { businessId_sku: { businessId: request.auth!.businessId, sku: input.data.sku } } });
  if (duplicate) throw new HttpError(409, "SKU_ALREADY_EXISTS", "Ya existe un producto con ese SKU.");
  const product = await prisma.product.create({ data: { ...input.data, businessId: request.auth!.businessId }, include: { category: true } });
  response.status(201).json({ product });
}));

router.patch("/products/:id", requireRole(Role.ADMIN), asyncRoute(async (request, response) => {
  const productId = parseId(request.params.id, "Product ID");
  const input = productSchema.safeParse(request.body);
  if (!input.success) throw new HttpError(422, "VALIDATION_ERROR", "Revisa los datos obligatorios del producto.", input.error.flatten());
  const existing = await prisma.product.findFirst({ where: { id: productId, businessId: request.auth!.businessId } });
  if (!existing) throw new HttpError(404, "PRODUCT_NOT_FOUND", "El producto no existe.");
  const category = await prisma.category.findFirst({ where: { id: input.data.categoryId, businessId: request.auth!.businessId } });
  if (!category) throw new HttpError(404, "CATEGORY_NOT_FOUND", "La categoría seleccionada no existe.");
  const duplicate = await prisma.product.findFirst({ where: { businessId: request.auth!.businessId, sku: input.data.sku, NOT: { id: productId } } });
  if (duplicate) throw new HttpError(409, "SKU_ALREADY_EXISTS", "Ya existe un producto con ese SKU.");
  const product = await prisma.product.update({ where: { id: productId }, data: input.data, include: { category: true } });
  response.json({ product });
}));

export default router;
