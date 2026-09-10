import { defineConfig, devices } from "@playwright/test";

const host = "127.0.0.1";
const webPort = Number(process.env.E2E_WEB_PORT ?? 5175);
const baseURL = process.env.E2E_BASE_URL ?? `http://${host}:${webPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 12_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }]
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    locale: "es-MX",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  }
});
