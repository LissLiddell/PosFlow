import { expect, type Page } from "@playwright/test";

type DemoRole = "Cajero" | "Supervisor" | "Administrador" | "Finanzas";
type StoreName = "Lucerna Roma" | "Lucerna Centro";

export async function loginAs(page: Page, role: DemoRole, store: StoreName = "Lucerna Roma") {
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(`^${role}`) }).click();
  if (role === "Cajero" || role === "Supervisor") {
    await page.getByRole("button", { name: new RegExp(`^${store}`) }).click();
  }
  await page.getByRole("button", { name: new RegExp(`Entrar como ${role.toLocaleLowerCase("es-MX")}`) }).click();
  await expect(page.getByRole("button", { name: /Cerrar sesión\. Usuario/ })).toBeVisible();
  await expect(page.getByText("Preparando la operación…")).toBeHidden();
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: /Cerrar sesión\. Usuario/ }).click();
  await expect(page.getByRole("button", { name: /Entrar como/ })).toBeVisible();
}

export async function openShift(page: Page, openingAmount = "1000.00") {
  await expect(page.getByRole("heading", { name: "Declaración de apertura" })).toBeVisible();
  await page.getByLabel("Fondo inicial").fill(openingAmount);
  await page.getByRole("button", { name: "Abrir turno →" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Caja abierta con" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Punto de venta" })).toBeVisible();
}

export async function openNavigation(page: Page, name: string | RegExp) {
  await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("button", { name }).click();
}

export async function closeShift(page: Page, quantities: Record<string, number>) {
  await openNavigation(page, "Corte");
  for (const [denomination, quantity] of Object.entries(quantities)) {
    await page.getByLabel(`Cantidad de piezas de ${denomination}`).fill(String(quantity));
  }
  await page.getByRole("checkbox", { name: /Terminé el conteo físico/ }).check();
  await page.getByRole("button", { name: "Conciliar y cerrar turno" }).click();
}

export function reportMetric(page: Page, name: string) {
  return page.locator(".report-metrics article").filter({ hasText: name });
}

export function shiftCashMetric(page: Page) {
  return page.locator(".cash-strip article.expected");
}
