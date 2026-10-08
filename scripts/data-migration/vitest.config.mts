import { defineConfig } from "vitest/config";
import path from "node:path";
// データ移行スクリプトを、アプリの部品（@/lib など）ごと動かすための設定。通常のテストとは別。
export default defineConfig({
  resolve: {
    alias: [
      {
        find: "server-only",
        replacement: path.resolve("tests/stubs/server-only.ts"),
      },
      { find: "@/lib/ui", replacement: path.resolve("src/lib/ui") },
      { find: "@/lib", replacement: path.resolve("lib") },
      { find: "@/actions", replacement: path.resolve("actions") },
    ],
  },
  test: {
    environment: "node",
    include: ["scripts/data-migration/backfill.test.ts"],
    testTimeout: 3_600_000,
  },
});
