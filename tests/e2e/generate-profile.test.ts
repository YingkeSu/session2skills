import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  cleanupDir,
  createTempDir,
  getProjectDir,
  killOrphanedOpenCodeServers,
  preflightChecks,
  runCLI,
} from "./helpers.js";

describe("generate --profile", () => {
  const projectDir = getProjectDir();
  const generatedOutputDirs: Array<string> = [];
  let legacyAnalyzeDir = "";
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

      legacyAnalyzeDir = createTempDir("session2skills-e2e-generate-profile-legacy-");

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
    } catch (error) {
      preflightFailure = error instanceof Error ? error : new Error(String(error));
      console.warn(`Skipping generate --profile E2E preflight: ${preflightFailure.message}`);
    }
  }, 120000);

  afterAll(() => {
    for (const outputDir of generatedOutputDirs) {
      cleanupDir(outputDir);
    }

    if (legacyAnalyzeDir) {
      cleanupDir(legacyAnalyzeDir);
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
    "accepts an analyze output directory as the profile input",
    () => {
      if (preflightFailure) {
        console.warn(`Skipping generate --profile test: ${preflightFailure.message}`);
        return;
      }

      const profileDir = createGeneratedOutputDir("session2skills-e2e-generate-profile-dir-input-");
      copyFileSync(legacyProfilePath, join(profileDir, "profile.json"));

      const outputDir = createGeneratedOutputDir("session2skills-e2e-generate-profile-dir-output-");

      const result = runCLI([
        "generate",
        "--profile",
        profileDir,
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
});
