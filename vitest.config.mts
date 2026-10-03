import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: {
    alias: [
      { find: "@/lib/ui", replacement: path.resolve("src/lib/ui") },
      { find: "@/lib", replacement: path.resolve("lib") },
      { find: "@/actions", replacement: path.resolve("actions") },
      { find: "@/app", replacement: path.resolve("src/app") },
      { find: "@/components", replacement: path.resolve("src/components") },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
  },
});
