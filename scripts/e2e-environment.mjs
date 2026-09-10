import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const browserPath = path.join(projectRoot, ".tmp", "ms-playwright");
const temporaryPath = path.join(projectRoot, ".tmp");

export function loadE2EEnvironment() {
  loadEnv({ path: path.join(projectRoot, ".env") });
  loadEnv({ path: path.join(projectRoot, "apps", "api", ".env") });
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required in .env before running E2E tests.");

  const databaseUrl = new URL(process.env.DATABASE_URL);
  databaseUrl.searchParams.set("schema", process.env.E2E_DATABASE_SCHEMA ?? "posflow_e2e");
  const demoPassword = process.env.DEMO_USER_PASSWORD ?? `e2e-${randomUUID()}-Aa1!`;

  return {
    ...process.env,
    DATABASE_URL: databaseUrl.toString(),
    NODE_ENV: "test",
    API_PORT: process.env.E2E_API_PORT ?? "4110",
    E2E_WEB_PORT: process.env.E2E_WEB_PORT ?? "5175",
    E2E_BASE_URL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5175",
    WEB_ORIGIN: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5175",
    VITE_API_URL: `http://127.0.0.1:${process.env.E2E_API_PORT ?? "4110"}/api`,
    DEMO_USER_PASSWORD: demoPassword,
    VITE_DEMO_PASSWORD: demoPassword,
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? browserPath,
    TEMP: temporaryPath,
    TMP: temporaryPath
  };
}

export function runNodeCli(relativeCliPath, args, env) {
  const cliPath = path.join(projectRoot, ...relativeCliPath);
  if (!existsSync(cliPath)) throw new Error(`Missing CLI dependency: ${cliPath}`);
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    env,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
