import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { loadE2EEnvironment, projectRoot, runNodeCli } from "./e2e-environment.mjs";

const sourceEnvironment = loadE2EEnvironment();
const databaseUrl = new URL(sourceEnvironment.DATABASE_URL);
databaseUrl.searchParams.set("schema", process.env.PORTFOLIO_DATABASE_SCHEMA ?? "posflow_portfolio");

const apiPort = process.env.PORTFOLIO_API_PORT ?? "4120";
const webPort = process.env.PORTFOLIO_WEB_PORT ?? "5185";
const baseURL = `http://127.0.0.1:${webPort}`;
const recordMode = process.argv.includes("--record");
const preservePathOptions = "--preserve-symlinks --preserve-symlinks-main";
const environment = {
  ...sourceEnvironment,
  DATABASE_URL: databaseUrl.toString(),
  NODE_ENV: "test",
  API_PORT: apiPort,
  E2E_WEB_PORT: webPort,
  E2E_BASE_URL: baseURL,
  WEB_ORIGIN: baseURL,
  VITE_API_URL: `http://127.0.0.1:${apiPort}/api`,
  NODE_OPTIONS: [sourceEnvironment.NODE_OPTIONS, preservePathOptions].filter(Boolean).join(" ")
};

function run(relativeCliPath, args) {
  const status = runNodeCli(relativeCliPath, args, environment);
  if (status !== 0) process.exit(status);
}

function startService(relativePath) {
  return spawn(process.execPath, [path.join(projectRoot, ...relativePath)], {
    cwd: projectRoot,
    env: environment,
    stdio: "inherit",
    windowsHide: true
  });
}

async function waitForUrl(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Capture service stopped before ${url} became available.`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

function stopService(child) {
  if (child.exitCode === null) child.kill();
}

async function waitForReady(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

async function capture(page, outputDirectory, filename) {
  await waitForReady(page);
  await page.screenshot({
    path: path.join(outputDirectory, filename),
    animations: "disabled",
    caret: "hide",
    fullPage: false
  });
  console.log(`Captured ${filename}`);
}

async function loginAs(page, role, store = "Lucerna Roma") {
  await page.goto(baseURL);
  await page.getByRole("button", { name: new RegExp(`^${role}`) }).click();
  if (role === "Cajero" || role === "Supervisor") {
    await page.getByRole("button", { name: new RegExp(`^${store}`) }).click();
  }
  await page.getByRole("button", { name: new RegExp(`Entrar como ${role.toLocaleLowerCase("es-MX")}`) }).click();
  await page.getByRole("button", { name: /Cerrar sesión\. Usuario/ }).waitFor();
  await page.getByText("Preparando la operación…").waitFor({ state: "hidden" });
}

async function logout(page) {
  await page.getByRole("button", { name: /Cerrar sesión\. Usuario/ }).click();
  await page.getByRole("button", { name: /Entrar como/ }).waitFor();
}

async function openNavigation(page, name) {
  await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("button", { name }).click();
  await page.locator("#main-content").waitFor();
}

console.log(`Preparing isolated portfolio data in PostgreSQL schema ${databaseUrl.searchParams.get("schema")}...`);
run(
  ["node_modules", "prisma", "build", "index.js"],
  ["db", "push", "--schema", "apps/api/prisma/schema.prisma", "--skip-generate", "--accept-data-loss"]
);
run(["node_modules", "tsx", "dist", "cli.mjs"], ["apps/api/prisma/seed.ts"]);
run(["apps", "api", "prisma", "seed-stage2.mjs"], []);
run(["node_modules", "typescript", "bin", "tsc"], ["-p", "apps/api/tsconfig.json"]);
run(
  ["node_modules", "vite", "bin", "vite.js"],
  ["build", "--config", "e2e/vite.config.ts", "--configLoader", "runner"]
);

const outputDirectory = path.join(projectRoot, "docs", "screenshots");
await mkdir(outputDirectory, { recursive: true });

const api = startService(["apps", "api", "dist", "server.js"]);
const web = startService(["scripts", "serve-e2e-web.mjs"]);
let browser;

try {
  await Promise.all([
    waitForUrl(`http://127.0.0.1:${apiPort}/api/health`, api),
    waitForUrl(baseURL, web)
  ]);

  if (recordMode) {
    console.log("");
    console.log("PosFlow recording environment is ready.");
    console.log(`Open ${baseURL} in the browser you will record.`);
    console.log("Press Ctrl+C here when the recording is finished.");
    await new Promise((resolve, reject) => {
      const finish = () => resolve();
      const fail = (name, code) => reject(new Error(`${name} stopped unexpectedly with code ${code}.`));
      process.once("SIGINT", finish);
      process.once("SIGTERM", finish);
      api.once("exit", (code) => { if (code !== null && code !== 0) fail("API", code); });
      web.once("exit", (code) => { if (code !== null && code !== 0) fail("Web", code); });
    });
  } else {
    process.env.PLAYWRIGHT_BROWSERS_PATH = environment.PLAYWRIGHT_BROWSERS_PATH;
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      locale: "es-MX",
      reducedMotion: "reduce"
    });
    const page = await context.newPage();

  await page.goto(baseURL);
  await capture(page, outputDirectory, "01-welcome-role-selector.png");

  await loginAs(page, "Cajero");
  await page.getByLabel("Fondo inicial").fill("2000.00");
  await page.getByRole("button", { name: "Abrir turno →" }).click();
  await page.getByRole("heading", { name: "Punto de venta" }).waitFor();
  await page.locator(".product-grid .product-card").filter({ hasText: "Vela cedro" }).click();
  await page.locator(".product-grid .product-card").filter({ hasText: "Agua mineral" }).click();
  await capture(page, outputDirectory, "02-cashier-sale-and-drawer.png");
  await page.getByRole("button", { name: "Usar importe exacto" }).click();
  await page.getByRole("button", { name: /Cobrar en efectivo/ }).click();
  await page.getByRole("status").filter({ hasText: /Venta .* registrada/ }).waitFor();

  await openNavigation(page, /Remesas/);
  await page.getByRole("tab", { name: /Pagar remesa/ }).click();
  await page.getByText("Remesa entrante lista").waitFor();
  await page.getByRole("status").filter({ hasText: /Venta .* registrada/ }).waitFor({ state: "hidden" });
  await capture(page, outputDirectory, "03-remittance-payout.png");
  await page.getByRole("button", { name: "Usar datos" }).click();
  await page.getByRole("button", { name: /Validar identidad y pagar/ }).click();
  await page.getByRole("status").filter({ hasText: /RM-DEMO2026 pagada/ }).waitFor();

  await openNavigation(page, /Anticipos/);
  await page.locator(".authorized-advances article").filter({ hasText: "Mariana López" }).getByRole("button", { name: /Entregar anticipo/ }).click();
  await page.getByRole("status").filter({ hasText: /AV-DEMO2026 entregado/ }).waitFor();

  await logout(page);
  await loginAs(page, "Finanzas");
  await openNavigation(page, /Anticipos/);
  const advanceCard = page.locator(".advance-tracker article").filter({ hasText: "Mariana López" });
  await advanceCard.getByRole("button", { name: /Registrar comprobación/ }).click();
  await advanceCard.getByLabel("Importe comprobado").fill("450.00");
  await advanceCard.getByLabel("Documento o gasto").fill("Factura de insumos F-1842");
  await advanceCard.getByRole("button", { name: "Aplicar comprobación" }).click();
  await page.getByRole("status").filter({ hasText: /pendiente \$150\.00/ }).waitFor();
  await advanceCard.scrollIntoViewIfNeeded();
  await capture(page, outputDirectory, "04-finance-advance-control.png");

  await logout(page);
  await loginAs(page, "Supervisor");
  await openNavigation(page, /Fajillas/);
  await page.getByLabel("Cantidad de piezas de $500.00 para fajilla").fill("1");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await page.getByRole("status").filter({ hasText: /guardada como borrador/ }).waitFor();
  await page.getByRole("button", { name: /Sellar fajilla/ }).click();
  await page.getByRole("status").filter({ hasText: "Fajilla sellada" }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, outputDirectory, "05-supervisor-cash-bundle.png");

  await logout(page);
  await loginAs(page, "Cajero");
  await openNavigation(page, "Corte");
  await page.getByLabel("Cantidad de piezas de $50.00").fill("5");
  await page.getByRole("checkbox", { name: /Terminé el conteo físico/ }).check();
  await page.getByRole("button", { name: "Conciliar y cerrar turno" }).click();
  await page.getByRole("heading", { name: "Cierre enviado a revisión" }).waitFor();

  await logout(page);
  await loginAs(page, "Supervisor");
  await page.getByRole("heading", { name: "Cierres pendientes" }).waitFor();
  await page.getByRole("button", { name: /Aprobar cierre de/ }).click();
  await page.getByRole("heading", { name: "La diferencia quedó explicada." }).waitFor();
  await capture(page, outputDirectory, "06-close-discrepancy-report.png");

  await logout(page);
  await loginAs(page, "Finanzas");
  await page.getByRole("heading", { name: /Todo el dinero/ }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, outputDirectory, "07-finance-overview.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, outputDirectory, "08-mobile-finance-overview.png");

    await context.close();
    console.log(`Portfolio capture set ready in ${outputDirectory}`);
  }
} finally {
  if (browser) await browser.close();
  stopService(web);
  stopService(api);
}
