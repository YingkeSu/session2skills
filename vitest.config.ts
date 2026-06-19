import { defineConfig } from "vitest/config";

const isCI = process.env.GITHUB_ACTIONS === "true" || process.env.CI === "true";

export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 600_000,
    reporters: isCI
      ? ["github-actions", "default"]
      : ["default"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
    },
  },
});
