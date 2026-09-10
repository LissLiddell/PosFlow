import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../apps/web/", import.meta.url));

export default defineConfig({
  root: webRoot,
  plugins: [vue()],
  resolve: { preserveSymlinks: true },
  build: {
    outDir: fileURLToPath(new URL("../apps/web/dist/", import.meta.url)),
    emptyOutDir: true
  }
});
