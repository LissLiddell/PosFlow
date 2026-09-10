import { Role } from "@prisma/client";

export type RegisterDelegations = {
  supervisorCanManageBundles: boolean;
  supervisorCanApproveClosures: boolean;
};

export function canManageCashBundles(role: Role, register: Pick<RegisterDelegations, "supervisorCanManageBundles">) {
  return role === Role.ADMIN || (role === Role.SUPERVISOR && register.supervisorCanManageBundles);
}

export function canApproveCloseExceptions(role: Role, register: Pick<RegisterDelegations, "supervisorCanApproveClosures">) {
  return role === Role.ADMIN || (role === Role.SUPERVISOR && register.supervisorCanApproveClosures);
}
