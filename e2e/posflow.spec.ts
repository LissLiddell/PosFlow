import { expect, test } from "@playwright/test";
import { cleanE2EDatabase, disconnectE2EDatabase, resetE2EDatabase } from "./fixtures/database.js";
import { closeShift, loginAs, logout, openNavigation, openShift, reportMetric, shiftCashMetric } from "./helpers/flows.js";

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

test("venta, cambio de rol, fajilla sellada y cierre cuadrado", async ({ page }) => {
  await loginAs(page, "Cajero");
  await openShift(page);

  await page.getByRole("button", { name: /Tarjeta de regalo/ }).click();
  await page.getByRole("button", { name: /Agregar una unidad de Tarjeta de regalo/ }).click();
  await page.getByRole("button", { name: "Usar importe exacto" }).click();
  await page.getByRole("button", { name: /Cobrar en efectivo/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /Venta .* registrada/ })).toBeVisible();
  await expect(shiftCashMetric(page)).toContainText("$1,500.00");

  await logout(page);
  await loginAs(page, "Supervisor");
  await openNavigation(page, /Fajillas/);
  await page.getByLabel("Cantidad de piezas de $500.00 para fajilla").fill("1");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByRole("status").filter({ hasText: /guardada como borrador/ })).toBeVisible();
  await page.getByRole("button", { name: /Sellar fajilla/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Fajilla sellada" })).toBeVisible();
  await expect(shiftCashMetric(page)).toContainText("$1,000.00");

  await logout(page);
  await loginAs(page, "Cajero");
  await closeShift(page, { "$1,000.00": 1 });

  await expect(page.getByRole("heading", { name: "Cada peso tiene una explicación." })).toBeVisible();
  await expect(reportMetric(page, "Efectivo esperado")).toContainText("$1,000.00");
  await expect(reportMetric(page, "Efectivo contado")).toContainText("$1,000.00");
  await expect(reportMetric(page, "Diferencia")).toContainText("$0.00");
  await expect(reportMetric(page, "Fajillas selladas")).toContainText("$500.00");
});

test("remesa enviada en Centro, pagada una sola vez en Roma y ambos cierres cuadrados", async ({ page }) => {
  await loginAs(page, "Cajero", "Lucerna Centro");
  await openShift(page);
  await openNavigation(page, /Remesas/);

  await page.getByLabel("Remitente").fill("Ana Remitente");
  await page.getByLabel("Beneficiario").fill("Beto Beneficiario");
  await page.getByLabel("Últimos 4 de identificación").fill("4321");
  await page.getByLabel("Sucursal de pago").selectOption({ label: "Lucerna Roma · Ciudad de México" });
  await page.getByLabel("Importe a enviar").fill("400.00");
  await page.getByRole("button", { name: /Recibir efectivo y generar referencia/ }).click();

  const sendToast = page.getByRole("status").filter({ hasText: /Remesa RM-.* disponible/ });
  await expect(sendToast).toBeVisible();
  const reference = (await sendToast.textContent())?.match(/RM-[A-Z0-9]+/)?.[0];
  expect(reference).toBeTruthy();
  await expect(shiftCashMetric(page)).toContainText("$1,420.00");

  await logout(page);
  await loginAs(page, "Cajero", "Lucerna Roma");
  await openShift(page);
  await openNavigation(page, /Remesas/);
  await page.getByRole("tab", { name: /Pagar remesa/ }).click();
  await page.getByLabel("Referencia").fill(reference!);
  await page.getByLabel("Últimos 4 de identificación").fill("4321");
  await page.getByRole("button", { name: /Validar identidad y pagar/ }).click();
  await expect(page.getByRole("status").filter({ hasText: `${reference} pagada` })).toBeVisible();
  await expect(shiftCashMetric(page)).toContainText("$600.00");

  await page.getByRole("tab", { name: /Pagar remesa/ }).click();
  await page.getByLabel("Referencia").fill(reference!);
  await page.getByLabel("Últimos 4 de identificación").fill("4321");
  await page.getByRole("button", { name: /Validar identidad y pagar/ }).click();
  await expect(page.getByRole("alert")).toContainText(/ya fue pagada|no está disponible/i);

  await closeShift(page, { "$500.00": 1, "$100.00": 1 });
  await expect(reportMetric(page, "Efectivo esperado")).toContainText("$600.00");

  await logout(page);
  await loginAs(page, "Cajero", "Lucerna Centro");
  await closeShift(page, { "$1,000.00": 1, "$200.00": 2, "$20.00": 1 });
  await expect(reportMetric(page, "Efectivo esperado")).toContainText("$1,420.00");
});

test("anticipo autorizado, entregado, comprobado, devuelto y liquidado", async ({ page }) => {
  const dueDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const recipient = "Mariana E2E";

  await loginAs(page, "Finanzas");
  await openNavigation(page, /Anticipos/);
  await page.getByLabel("Tipo de receptor").selectOption("EMPLOYEE");
  await page.getByRole("textbox", { name: "Receptor", exact: true }).fill(recipient);
  await page.getByLabel("Tienda que entregará").selectOption({ label: "Lucerna Roma · Ciudad de México" });
  await page.getByLabel("Importe").fill("400.00");
  await page.getByLabel("Propósito").fill("Compra urgente de insumos E2E");
  await page.getByLabel("Fecha límite").fill(dueDate);
  await page.getByRole("button", { name: /Autorizar anticipo/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /Anticipo AV-.* autorizado/ })).toBeVisible();

  await logout(page);
  await loginAs(page, "Cajero");
  await openShift(page);
  await openNavigation(page, /Anticipos/);
  const cashCard = page.locator(".authorized-advances article").filter({ hasText: recipient });
  await cashCard.getByRole("button", { name: /Entregar anticipo/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /entregado/ })).toBeVisible();
  await expect(shiftCashMetric(page)).toContainText("$600.00");

  await logout(page);
  await loginAs(page, "Finanzas");
  await openNavigation(page, /Anticipos/);
  const financeCard = page.locator(".advance-tracker article").filter({ hasText: recipient });
  await financeCard.getByRole("button", { name: /Registrar comprobación/ }).click();
  await financeCard.getByLabel("Importe comprobado").fill("250.00");
  await financeCard.getByLabel("Documento o gasto").fill("Factura E2E-250");
  await financeCard.getByRole("button", { name: "Aplicar comprobación" }).click();
  await expect(page.getByRole("status").filter({ hasText: /pendiente \$150\.00/ })).toBeVisible();

  await logout(page);
  await loginAs(page, "Cajero");
  await openNavigation(page, /Anticipos/);
  const returnCard = page.locator(".accountable-advances article").filter({ hasText: recipient });
  await returnCard.getByRole("button", { name: /Recibir efectivo sobrante/ }).click();
  await returnCard.getByLabel("Efectivo devuelto").fill("150.00");
  await returnCard.getByLabel("Motivo").fill("Sobrante de compra E2E");
  await returnCard.getByRole("button", { name: "Ingresar al cajón" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Devolución aplicada/ })).toBeVisible();
  await expect(returnCard).toContainText("Liquidado");
  await expect(shiftCashMetric(page)).toContainText("$750.00");

  await closeShift(page, { "$500.00": 1, "$200.00": 1, "$50.00": 1 });
  await expect(reportMetric(page, "Efectivo esperado")).toContainText("$750.00");
  await expect(page.getByText("Anticipo entregado")).toBeVisible();
  await expect(page.getByText("Devolución de anticipo", { exact: true })).toBeVisible();
});

test("faltante queda pendiente y el supervisor aprueba sin alterar el conteo", async ({ page }) => {
  await loginAs(page, "Cajero", "Lucerna Centro");
  await openShift(page);
  await closeShift(page, { "$500.00": 1, "$200.00": 2, "$50.00": 1 });

  await expect(page.getByRole("heading", { name: "Cierre enviado a revisión" })).toBeVisible();
  await logout(page);
  await loginAs(page, "Supervisor", "Lucerna Centro");
  await expect(page.getByRole("heading", { name: "Cierres pendientes" })).toBeVisible();
  await page.getByRole("button", { name: /Aprobar cierre de/ }).click();

  await expect(page.getByRole("heading", { name: "La diferencia quedó explicada." })).toBeVisible();
  await expect(reportMetric(page, "Efectivo esperado")).toContainText("$1,000.00");
  await expect(reportMetric(page, "Efectivo contado")).toContainText("$950.00");
  await expect(reportMetric(page, "Diferencia")).toContainText("-$50.00");
  await expect(page.getByText("Aprobado con diferencia")).toBeVisible();
});
