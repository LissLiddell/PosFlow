import { Role } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { canApproveCloseExceptions, canManageCashBundles } from "./permissions.js";

describe("administrator-controlled delegations", () => {
  it("always lets an administrator manage and seal cash bundles", () => {
    expect(canManageCashBundles(Role.ADMIN, { supervisorCanManageBundles: false })).toBe(true);
  });

  it("lets a supervisor manage bundles only when delegated", () => {
    expect(canManageCashBundles(Role.SUPERVISOR, { supervisorCanManageBundles: true })).toBe(true);
    expect(canManageCashBundles(Role.SUPERVISOR, { supervisorCanManageBundles: false })).toBe(false);
  });

  it("never lets cashier or finance manage bundles", () => {
    expect(canManageCashBundles(Role.CASHIER, { supervisorCanManageBundles: true })).toBe(false);
    expect(canManageCashBundles(Role.FINANCE, { supervisorCanManageBundles: true })).toBe(false);
  });

  it("always lets an administrator approve a close exception", () => {
    expect(canApproveCloseExceptions(Role.ADMIN, { supervisorCanApproveClosures: false })).toBe(true);
  });

  it("lets a supervisor approve a close only when delegated", () => {
    expect(canApproveCloseExceptions(Role.SUPERVISOR, { supervisorCanApproveClosures: true })).toBe(true);
    expect(canApproveCloseExceptions(Role.SUPERVISOR, { supervisorCanApproveClosures: false })).toBe(false);
  });
});
