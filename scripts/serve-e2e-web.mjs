import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "dist");
const port = Number(process.env.E2E_WEB_PORT ?? 5175);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

createServer((request, response) => {
  const requestedPath = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
  const candidate = path.resolve(root, `.${requestedPath}`);
  const safeCandidate = candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile()
    ? candidate
    : path.join(root, "index.html");
  response.setHeader("Content-Type", contentTypes[path.extname(safeCandidate)] ?? "application/octet-stream");
  createReadStream(safeCandidate).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`PosFlow E2E web server listening on ${port}`);
});
