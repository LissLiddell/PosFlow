import type { Role } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        businessId: string;
        storeId?: string;
        role: Role;
      };
    }
  }
}

export {};

