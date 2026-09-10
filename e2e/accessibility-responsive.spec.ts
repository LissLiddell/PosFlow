import { expect, test, type Page } from "@playwright/test";
import { cleanE2EDatabase, disconnectE2EDatabase, resetE2EDatabase } from "./fixtures/database.js";
import { loginAs, openNavigation, openShift } from "./helpers/flows.js";

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test.afterAll(async () => {
  try {
    await cleanE2EDatabase();
  } finally {
    await disconnectE2EDatabase();
  }
});

async function expectNoPageOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }))).toEqual(expect.objectContaining({
    clientWidth: expect.any(Number),
    scrollWidth: expect.any(Number)
  }));

  const widths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(widths.scrollWidth, `La página mide ${widths.scrollWidth}px dentro de un viewport de ${widths.clientWidth}px`).toBeLessThanOrEqual(widths.clientWidth + 1);
}

test("el flujo móvil conserva foco, navegación y pestañas operables con teclado", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Saltar al contenido principal" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#login-content")).toBeFocused();

  await loginAs(page, "Cajero");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expectNoPageOverflow(page);

  await openShift(page);
  const saleNavigation = page.getByRole("navigation", { name: "Navegación principal" }).getByRole("button", { name: "Venta" });
  await expect(saleNavigation).toHaveAttribute("aria-current", "page");

  await page.getByRole("button", { name: /Tarjeta de regalo/ }).click();
  await expect(page.getByRole("button", { name: /Quitar una unidad de Tarjeta de regalo/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Agregar una unidad de Tarjeta de regalo/ })).toBeVisible();

  await openNavigation(page, /Remesas/);
  const sendTab = page.getByRole("tab", { name: "Enviar dinero" });
  const payTab = page.getByRole("tab", { name: /Pagar remesa/ });
  await expect(sendTab).toHaveAttribute("aria-selected", "true");
  await sendTab.focus();
  await sendTab.press("ArrowRight");
  await expect(payTab).toBeFocused();
  await expect(payTab).toHaveAttribute("aria-selected", "true");
  await expectNoPageOverflow(page);
});

test("Finanzas no desborda la pantalla en celular ni tablet", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await loginAs(page, "Finanzas");
  await expect(page.getByRole("heading", { name: /Todo el dinero/ })).toBeVisible();
  await expectNoPageOverflow(page);

  await openNavigation(page, /Anticipos/);
  await expectNoPageOverflow(page);

  await page.setViewportSize({ width: 768, height: 1024 });
  await openNavigation(page, "Finanzas");
  await expectNoPageOverflow(page);
});

test("el catálogo administrativo mantiene su tabla dentro del viewport móvil", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await loginAs(page, "Administrador");
  await openNavigation(page, "Productos");

  await expect(page.getByRole("table", { name: "Catálogo de productos" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Editar Tarjeta de regalo/ })).toBeVisible();
  await expectNoPageOverflow(page);
});
