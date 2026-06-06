import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 600_000,
  },
});
