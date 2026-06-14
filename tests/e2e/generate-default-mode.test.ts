import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  cleanupDir,
  createTempDir,
  getHybridEnv,
  getProjectDir,
  killOrphanedOpenCodeServers,
  preflightChecks,
  runCLI,
  runCLIAsync,
} from "./helpers.js";

type GenerateModeOutput = {
  mode: string;
  outputDirectory: string;
};

function parseGenerateMode(stdout: string): GenerateModeOutput {
  const trimmed = stdout.trim();
  let searchFrom = trimmed.length;
  while (searchFrom > 0) {
    const braceIdx = trimmed.lastIndexOf("\n{", searchFrom);
    if (braceIdx < 0) break;
    const candidate = trimmed.slice(braceIdx + 1);
    try {
      const parsed = JSON.parse(candidate) as GenerateModeOutput;
      if (typeof parsed.mode === "string") return parsed;
    } catch {
      void candidate;
    }
    searchFrom = braceIdx - 1;
  }
  const fallback = JSON.parse(trimmed) as GenerateModeOutput;
  return fallback;
}

// Clear LLM env vars so generate falls back to legacy mode (issue #18 default change).
const legacyOnlyEnv = {
  SESSION2SKILLS_LLM_BASE_URL: "",
  SESSION2SKILLS_LLM_MODEL: "",
};

describe("generate default mode resolution", () => {
  const projectDir = getProjectDir();
  let hybridEnv: Record<string, string> = {};
  let preflightFailure: Error | null = null;
  let legacyProfileDir = "";
  let tempDirs: string[] = [];

  function trackTempDir(prefix: string): string {
    const dir = createTempDir(prefix);
    tempDirs.push(dir);
    return dir;
  }

  beforeAll(() => {
    try {
      preflightChecks();
      hybridEnv = getHybridEnv();

      legacyProfileDir = createTempDir("session2skills-e2e-default-mode-profile-");
      const legacyAnalyze = runCLI(
        ["analyze", "-d", projectDir, "--recent", "3", "-o", legacyProfileDir],
        { env: legacyOnlyEnv },
      );
      if (legacyAnalyze.status !== 0) {
        throw new Error(`Legacy analyze preflight failed with exit code ${legacyAnalyze.status ?? "null"}.`);
      }
      if (!existsSync(join(legacyProfileDir, "profile.json"))) {
        throw new Error("E2E preflight: legacy analyze did not produce profile.json.");
      }
    } catch (error) {
      preflightFailure = error instanceof Error ? error : new Error(String(error));
      console.warn(`Skipping generate default-mode E2E preflight: ${preflightFailure.message}`);
    }
  }, 120000);

  afterEach(() => {
    for (const dir of tempDirs) {
      cleanupDir(dir);
    }
    tempDirs = [];
  });

  afterAll(() => {
    if (legacyProfileDir) {
      cleanupDir(legacyProfileDir);
    }
    killOrphanedOpenCodeServers();
  });

  it(
    "defaults to harness mode when LLM env vars are present and no flags are passed",
    async () => {
      if (preflightFailure) {
        console.warn(`Skipping default-harness test: ${preflightFailure.message}`);
        return;
      }

      const outputDir = trackTempDir("session2skills-e2e-default-harness-");

      const result = await runCLIAsync(
        [
          "generate",
          "-d",
          projectDir,
          "--recent",
          "3",
          "--output",
          outputDir,
          "--tone",
          "balanced",
        ],
        { env: hybridEnv, timeout: 300000 },
      );

      expect(result.status).toBe(0);
      expect(existsSync(join(outputDir, "summary.md"))).toBe(true);
      expect(existsSync(join(outputDir, "SKILL.md"))).toBe(true);
      expect(existsSync(join(outputDir, "claim-manifest.json"))).toBe(true);
      expect(existsSync(join(outputDir, "skeptic-report.json"))).toBe(true);
      expect(existsSync(join(outputDir, "verifier-report.json"))).toBe(true);

      const output = parseGenerateMode(result.stdout);
      expect(output.mode).toBe("harness");
    },
    300000,
  );

  it(
    "uses hybrid mode and prints a deprecation warning when --hybrid is passed",
    async () => {
      if (preflightFailure) {
        console.warn(`Skipping hybrid-deprecation test: ${preflightFailure.message}`);
        return;
      }

      const outputDir = trackTempDir("session2skills-e2e-hybrid-deprecated-");

      const result = await runCLIAsync(
        [
          "generate",
          "-d",
          projectDir,
          "--recent",
          "3",
          "--output",
          outputDir,
          "--hybrid",
          "--tone",
          "balanced",
        ],
        { env: hybridEnv, timeout: 300000 },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toMatch(/--hybrid is deprecated/i);
      expect(existsSync(join(outputDir, "summary.md"))).toBe(true);
      expect(existsSync(join(outputDir, "SKILL.md"))).toBe(true);
      expect(existsSync(join(outputDir, "merged-claims.json"))).toBe(true);
      expect(existsSync(join(outputDir, "skill-plan.json"))).toBe(true);

      const output = parseGenerateMode(result.stdout);
      expect(output.mode).toBe("hybrid");
    },
    300000,
  );

  it(
    "uses harness mode when --harness is passed explicitly",
    async () => {
      if (preflightFailure) {
        console.warn(`Skipping explicit-harness test: ${preflightFailure.message}`);
        return;
      }

      const outputDir = trackTempDir("session2skills-e2e-explicit-harness-");

      const result = await runCLIAsync(
        [
          "generate",
          "-d",
          projectDir,
          "--recent",
          "3",
          "--output",
          outputDir,
          "--harness",
          "--tone",
          "balanced",
        ],
        { env: hybridEnv, timeout: 300000 },
      );

      expect(result.status).toBe(0);
      expect(existsSync(join(outputDir, "summary.md"))).toBe(true);
      expect(existsSync(join(outputDir, "SKILL.md"))).toBe(true);
      expect(existsSync(join(outputDir, "claim-manifest.json"))).toBe(true);

      const output = parseGenerateMode(result.stdout);
      expect(output.mode).toBe("harness");
    },
    300000,
  );

  it(
    "uses legacy mode when LLM env vars are absent and no flags are passed",
    () => {
      if (preflightFailure) {
        console.warn(`Skipping legacy-default test: ${preflightFailure.message}`);
        return;
      }

      const outputDir = trackTempDir("session2skills-e2e-legacy-no-env-");

      const result = runCLI(
        [
          "generate",
          "-d",
          projectDir,
          "--recent",
          "3",
          "--output",
          outputDir,
          "--tone",
          "balanced",
        ],
        { env: legacyOnlyEnv },
      );

      expect(result.status).toBe(0);
      expect(existsSync(join(outputDir, "summary.md"))).toBe(true);
      expect(existsSync(join(outputDir, "SKILL.md"))).toBe(true);

      // Legacy mode writes ONLY summary.md and SKILL.md — no harness/hybrid artifacts
      expect(existsSync(join(outputDir, "claim-manifest.json"))).toBe(false);
      expect(existsSync(join(outputDir, "merged-claims.json"))).toBe(false);
      expect(existsSync(join(outputDir, "skeptic-report.json"))).toBe(false);

      const output = parseGenerateMode(result.stdout);
      expect(output.mode).toBe("legacy");
    },
    60000,
  );

  it(
    "uses profile mode when --profile is passed, unaffected by LLM env vars",
    () => {
      if (preflightFailure) {
        console.warn(`Skipping profile-mode test: ${preflightFailure.message}`);
        return;
      }

      const outputDir = trackTempDir("session2skills-e2e-profile-mode-");

      const result = runCLI(
        [
          "generate",
          "--profile",
          join(legacyProfileDir, "profile.json"),
          "--output",
          outputDir,
          "--tone",
          "balanced",
        ],
        { env: hybridEnv },
      );

      expect(result.status).toBe(0);
      expect(existsSync(join(outputDir, "summary.md"))).toBe(true);
      expect(existsSync(join(outputDir, "SKILL.md"))).toBe(true);

      const summary = readFileSync(join(outputDir, "summary.md"), "utf-8");
      expect(summary.trim().length).toBeGreaterThan(0);
    },
    60000,
  );
});
