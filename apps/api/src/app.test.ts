import { Role } from "@prisma/client";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "./app.js";
import { env } from "./config.js";

async function tokenFor(role: Role) {
  return new SignJWT({ businessId: "qa-business", storeId: "qa-store", role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("qa-user")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(env.JWT_SECRET));
}

describe("PosFlow API", () => {
  it("reports service health", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "posflow-api" });
  });

  it("does not expose unknown routes", async () => {
    const response = await request(app).get("/api/not-real");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("protects the consolidated finance view", async () => {
    const response = await request(app).get("/api/finance/overview");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("prevents a cashier from authorizing advances", async () => {
    const response = await request(app).post("/api/advances").set("Authorization", `Bearer ${await tokenFor(Role.CASHIER)}`).send({});
    expect(response.status).toBe(403);
  });

  it("prevents Finance from issuing cash advances", async () => {
    const response = await request(app).post("/api/advances/not-an-id/issue").set("Authorization", `Bearer ${await tokenFor(Role.FINANCE)}`).send({});
    expect(response.status).toBe(403);
  });

  it("prevents a cashier from preparing cash bundles", async () => {
    const response = await request(app).post("/api/cash-bundles").set("Authorization", `Bearer ${await tokenFor(Role.CASHIER)}`).send({});
    expect(response.status).toBe(403);
  });

  it("prevents a supervisor from changing the product catalog", async () => {
    const response = await request(app).post("/api/catalog/products").set("Authorization", `Bearer ${await tokenFor(Role.SUPERVISOR)}`).send({});
    expect(response.status).toBe(403);
  });

  it("prevents Finance from changing register controls", async () => {
    const response = await request(app).patch("/api/settings/registers/not-an-id").set("Authorization", `Bearer ${await tokenFor(Role.FINANCE)}`).send({});
    expect(response.status).toBe(403);
  });

  it("prevents supervisors from opening the global finance dashboard", async () => {
    const response = await request(app).get("/api/finance/overview").set("Authorization", `Bearer ${await tokenFor(Role.SUPERVISOR)}`);
    expect(response.status).toBe(403);
  });

  it("prevents administrators from operating customer remittances", async () => {
    const response = await request(app).post("/api/remittances/send").set("Authorization", `Bearer ${await tokenFor(Role.ADMIN)}`).send({});
    expect(response.status).toBe(403);
  });

  it("prevents Finance from opening a register", async () => {
    const response = await request(app).post("/api/shifts/open").set("Authorization", `Bearer ${await tokenFor(Role.FINANCE)}`).send({});
    expect(response.status).toBe(403);
  });
});
