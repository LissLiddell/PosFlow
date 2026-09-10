import { Router } from "express";
import { compare } from "bcryptjs";
import { SignJWT } from "jose";
import { z } from "zod";
import { env } from "../config.js";
import { asyncRoute, HttpError } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const secret = new TextEncoder().encode(env.JWT_SECRET);
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(100) });

const userSelection = {
  id: true,
  name: true,
  email: true,
  role: true,
  business: { select: { id: true, name: true, slug: true } },
  store: { select: { id: true, name: true, code: true, city: true } }
} as const;

router.post("/login", asyncRoute(async (request, response) => {
  const input = loginSchema.safeParse(request.body);
  if (!input.success) throw new HttpError(422, "VALIDATION_ERROR", "Check the sign-in fields.", input.error.flatten());

  const user = await prisma.user.findFirst({
    where: { email: input.data.email.toLowerCase(), active: true },
    include: { business: { select: { id: true, name: true, slug: true } }, store: { select: { id: true, name: true, code: true, city: true } } }
  });
  if (!user || !(await compare(input.data.password, user.passwordHash))) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }

  const token = await new SignJWT({ businessId: user.businessId, storeId: user.storeId, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secret);

  response.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      business: user.business,
      store: user.store
    }
  });
}));

router.get("/me", requireAuth, asyncRoute(async (request, response) => {
  const user = await prisma.user.findFirst({
    where: { id: request.auth!.userId, businessId: request.auth!.businessId, active: true },
    select: userSelection
  });
  if (!user) throw new HttpError(404, "USER_NOT_FOUND", "The current user no longer exists.");
  response.json({ user });
}));

export default router;

