import { spawn } from "node:child_process";
import path from "node:path";
import { loadE2EEnvironment, runNodeCli } from "./e2e-environment.mjs";
import { projectRoot } from "./e2e-environment.mjs";

const env = loadE2EEnvironment();

const schemaStatus = runNodeCli(
  ["node_modules", "prisma", "build", "index.js"],
  ["db", "push", "--schema", "apps/api/prisma/schema.prisma", "--skip-generate", "--accept-data-loss"],
  env
);
if (schemaStatus !== 0) process.exit(schemaStatus);

const buildStatus = runNodeCli(
  ["node_modules", "typescript", "bin", "tsc"],
  ["-p", "apps/api/tsconfig.json"],
  env
);
if (buildStatus !== 0) process.exit(buildStatus);

const webBuildStatus = runNodeCli(
  ["node_modules", "vite", "bin", "vite.js"],
  ["build", "--config", "e2e/vite.config.ts", "--configLoader", "runner"],
  env
);
if (webBuildStatus !== 0) process.exit(webBuildStatus);

function startService(relativePath) {
  return spawn(process.execPath, [path.join(projectRoot, ...relativePath)], {
    cwd: projectRoot,
    env,
    stdio: "inherit",
    windowsHide: true
  });
}

async function waitForUrl(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`E2E service stopped before ${url} became available.`);
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

const api = startService(["apps", "api", "dist", "server.js"]);
const web = startService(["scripts", "serve-e2e-web.mjs"]);
let testStatus = 1;
try {
  await Promise.all([
    waitForUrl(`http://127.0.0.1:${env.API_PORT}/api/health`, api),
    waitForUrl(env.E2E_BASE_URL, web)
  ]);
  testStatus = runNodeCli(["node_modules", "playwright", "cli.js"], ["test", ...process.argv.slice(2)], env);
} finally {
  stopService(web);
  stopService(api);
}

process.exit(testStatus);
