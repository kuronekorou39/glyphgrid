import { resolve } from "node:path";
import { defineConfig } from "vite";
import { setsApiPlugin } from "./src/server/sets-api.js";

export default defineConfig({
  root: "src/ui",
  plugins: [setsApiPlugin(resolve(import.meta.dirname, "sets"))],
  oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
  build: { outDir: resolve(import.meta.dirname, "dist/ui"), emptyOutDir: true },
});
