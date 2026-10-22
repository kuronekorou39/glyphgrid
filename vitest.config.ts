import { defineConfig } from "vitest/config";

// vite.config.ts は root を src/ui にしているので、テストは別設定でプロジェクト直下から探す
export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
});
