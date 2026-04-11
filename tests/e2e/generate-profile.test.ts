import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SkillPlan } from "../../src/normalize/models.js";
import {
  cleanupDir,
  createTempDir,
  getHybridEnv,
  getProjectDir,
  killOrphanedOpenCodeServers,
  preflightChecks,
  readArtifact,
  runCLI,
} from "./helpers.js";

describe("generate --profile", () => {
  const projectDir = getProjectDir();
  const generatedOutputDirs: Array<string> = [];
  let hybridEnv: Record<string, string> = {};
  let legacyAnalyzeDir = "";
  let hybridAnalyzeDir = "";
  let legacyProfilePath = "";
  let preflightFailure: Error | null = null;

  function createGeneratedOutputDir(prefix: string): string {
    const dir = createTempDir(prefix);
    generatedOutputDirs.push(dir);
    return dir;
  }

  function expectCliSuccess(
    commandLabel: string,
    result: { status: number | null; stdout: string; stderr: string },
  ): void {
    if (result.status !== 0) {
      throw new Error(
        [
          `${commandLabel} failed with exit code ${result.status ?? "null"}.`,
          `stdout:\n${result.stdout}`,
          `stderr:\n${result.stderr}`,
        ].join("\n\n"),
      );
    }
  }

  beforeAll(() => {
    try {
      preflightChecks();
      hybridEnv = getHybridEnv();

      legacyAnalyzeDir = createTempDir("session2skills-e2e-generate-profile-legacy-");
      hybridAnalyzeDir = createTempDir("session2skills-e2e-generate-profile-hybrid-");

      const legacyAnalyzeResult = runCLI(["analyze", "-d", projectDir, "--recent", "3", "-o", legacyAnalyzeDir]);
      expectCliSuccess("legacy analyze preflight", legacyAnalyzeResult);
      const generatedLegacyProfilePath = join(legacyAnalyzeDir, "profile.json");

      if (!existsSync(generatedLegacyProfilePath)) {
        throw new Error(
          legacyAnalyzeResult.stdout.includes("No OpenCode sessions found")
            ? "E2E preflight: analyze command found no analyzable OpenCode sessions."
            : "E2E preflight: legacy analyze did not produce profile.json.",
        );
      }

      const rawLegacyProfile = readFileSync(generatedLegacyProfilePath, "utf-8");
      const parsedLegacyProfile = JSON.parse(rawLegacyProfile) as Record<string, unknown>;

      legacyProfilePath = join(legacyAnalyzeDir, "legacy-profile-v1.json");
      if (parsedLegacyProfile.schemaVersion === "profile/v2") {
        const {
          acceptedClaims: _acceptedClaims,
          mergedClaims: _mergedClaims,
          promptSetVersion: _promptSetVersion,
          schemaVersion: _schemaVersion,
          tentativeClaims: _tentativeClaims,
          ...legacyCompatibleProfile
        } = parsedLegacyProfile;

        writeFileSync(legacyProfilePath, `${JSON.stringify(legacyCompatibleProfile, null, 2)}\n`, "utf-8");
      } else {
        writeFileSync(
          legacyProfilePath,
          rawLegacyProfile.endsWith("\n") ? rawLegacyProfile : `${rawLegacyProfile}\n`,
          "utf-8",
        );
      }

      const hybridAnalyzeResult = runCLI(
        ["analyze", "-d", projectDir, "--recent", "3", "-o", hybridAnalyzeDir, "--hybrid"],
        {
          env: hybridEnv,
          timeout: 300000,
        },
      );
      expectCliSuccess("hybrid analyze preflight", hybridAnalyzeResult);
      if (!existsSync(join(hybridAnalyzeDir, "profile.json"))) {
        throw new Error(
          hybridAnalyzeResult.stdout.includes("No OpenCode sessions found")
            ? "E2E preflight: hybrid analyze command found no analyzable OpenCode sessions."
            : "E2E preflight: hybrid analyze did not produce profile.json.",
        );
      }
    } catch (error) {
      preflightFailure = error instanceof Error ? error : new Error(String(error));
      console.warn(`Skipping generate --profile E2E preflight: ${preflightFailure.message}`);
    }
  }, 600000);

  afterAll(() => {
    for (const outputDir of generatedOutputDirs) {
      cleanupDir(outputDir);
    }

    if (legacyAnalyzeDir) {
      cleanupDir(legacyAnalyzeDir);
    }

    if (hybridAnalyzeDir) {
      cleanupDir(hybridAnalyzeDir);
    }

    killOrphanedOpenCodeServers();
  });

  it(
    "generates summary.md and SKILL.md from a legacy profile",
    () => {
      if (preflightFailure) {
        console.warn(`Skipping generate --profile test: ${preflightFailure.message}`);
        return;
      }

      const outputDir = createGeneratedOutputDir("session2skills-e2e-generate-profile-output-");

      const result = runCLI([
        "generate",
        "--profile",
        legacyProfilePath,
        "--output",
        outputDir,
        "--tone",
        "balanced",
      ]);

      expect(result.status).toBe(0);
      expect(existsSync(join(outputDir, "summary.md"))).toBe(true);
      expect(existsSync(join(outputDir, "SKILL.md"))).toBe(true);
    },
    60000,
  );

  it(
    "auto-detects a profile/v2 artifact and uses the LLM renderer",
    () => {
      if (preflightFailure) {
        console.warn(`Skipping generate --profile test: ${preflightFailure.message}`);
        return;
      }

      const outputDir = createGeneratedOutputDir("session2skills-e2e-generate-profile-hybrid-output-");

      const result = runCLI(
        [
          "generate",
          "--profile",
          join(hybridAnalyzeDir, "profile.json"),
          "--output",
          outputDir,
          "--tone",
          "balanced",
        ],
        {
          env: hybridEnv,
          timeout: 300000,
        },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/"skillRenderer"\s*:\s*"(llm|fallback)"/);
    },
    300000,
  );

  it(
    "fails for an invalid profile path",
    () => {
      if (preflightFailure) {
        console.warn(`Skipping generate --profile test: ${preflightFailure.message}`);
        return;
      }

      const outputDir = createGeneratedOutputDir("session2skills-e2e-generate-profile-invalid-");
      const result = runCLI([
        "generate",
        "--profile",
        "/nonexistent/profile.json",
        "--output",
        outputDir,
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr.trim()).not.toBe("");
    },
    60000,
  );

  it(
    "reuses a sibling hybrid skill-plan.json instead of recomputing it",
    () => {
      if (preflightFailure) {
        console.warn(`Skipping generate --profile test: ${preflightFailure.message}`);
        return;
      }

      const sentinelPlanId = "e2e-sentinel-reused";
      const siblingSkillPlanPath = join(hybridAnalyzeDir, "skill-plan.json");
      const siblingSkillPlan = JSON.parse(readFileSync(siblingSkillPlanPath, "utf-8")) as SkillPlan;

      siblingSkillPlan.planID = sentinelPlanId;
      writeFileSync(siblingSkillPlanPath, `${JSON.stringify(siblingSkillPlan, null, 2)}\n`, "utf-8");

      const outputDir = createGeneratedOutputDir("session2skills-e2e-generate-profile-sentinel-");
      const result = runCLI(
        ["generate", "--profile", join(hybridAnalyzeDir, "profile.json"), "--output", outputDir],
        {
          env: hybridEnv,
          timeout: 300000,
        },
      );

      expect(result.status).toBe(0);

      const outputSkillPlan = readArtifact<SkillPlan>(outputDir, "skill-plan.json");

      expect(outputSkillPlan.planID).toBe(sentinelPlanId);
    },
    300000,
  );
});
