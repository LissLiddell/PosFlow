import { Role } from "@prisma/client";
import type { RequestHandler } from "express";
import { jwtVerify } from "jose";
import { env } from "../config.js";
import { HttpError } from "../lib/http.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);
const validRoles = new Set(Object.values(Role));

export const requireAuth: RequestHandler = async (request, _response, next) => {
  try {
    const value = request.header("authorization");
    if (!value?.startsWith("Bearer ")) {
      throw new HttpError(401, "UNAUTHENTICATED", "Sign in to continue.");
    }

    const { payload } = await jwtVerify(value.slice(7), secret);
    if (
      typeof payload.sub !== "string" ||
      typeof payload.businessId !== "string" ||
      !validRoles.has(payload.role as Role)
    ) {
      throw new HttpError(401, "INVALID_TOKEN", "The session is not valid.");
    }

    request.auth = {
      userId: payload.sub,
      businessId: payload.businessId,
      storeId: typeof payload.storeId === "string" ? payload.storeId : undefined,
      role: payload.role as Role
    };
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, "INVALID_TOKEN", "The session is not valid."));
  }
};

export function requireRole(...allowedRoles: Role[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth || !allowedRoles.includes(request.auth.role)) {
      next(new HttpError(403, "FORBIDDEN", "Your role cannot perform this action."));
      return;
    }
    next();
  };
}

