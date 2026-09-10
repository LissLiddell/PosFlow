import { loadE2EEnvironment, runNodeCli } from "./e2e-environment.mjs";

const env = loadE2EEnvironment();
process.exit(runNodeCli(["node_modules", "playwright", "cli.js"], ["install", "chromium"], env));
