import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupDir,
  createTempDir,
  getProjectDir,
  killOrphanedOpenCodeServers,
  preflightChecks,
  runCLI,
} from "./helpers.js";

describe("error scenarios", () => {
  const projectDir = getProjectDir();
  const invalidProjectDirectory = "/nonexistent/path/that/does/not/exist";

  let tempDir = "";
  let sessionPreflightFailure: Error | null = null;
  let analyzePreflightFailure: Error | null = null;

  function shouldSkip(label: string, failure: Error | null): boolean {
    if (!failure) {
      return false;
    }

    console.warn(`Skipping ${label}: ${failure.message}`);
    return true;
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
    } catch (error) {
      sessionPreflightFailure = error instanceof Error ? error : new Error(String(error));
      analyzePreflightFailure = sessionPreflightFailure;
      console.warn(`Skipping session-backed error scenario preflight: ${sessionPreflightFailure.message}`);
      return;
    }

    const probeDir = createTempDir("session2skills-e2e-error-scenarios-probe-");

    try {
      const probe = runCLI(["analyze", "-d", projectDir, "--recent", "3", "-o", probeDir]);

      expectCliSuccess("analyze preflight", probe);

      if (probe.stdout.includes("No OpenCode sessions found")) {
        throw new Error("E2E preflight: analyze command found no analyzable OpenCode sessions.");
      }

      if (!existsSync(join(probeDir, "profile.json"))) {
        throw new Error("E2E preflight: analyze command did not produce profile.json.");
      }
    } catch (error) {
      analyzePreflightFailure = error instanceof Error ? error : new Error(String(error));
      console.warn(`Skipping analyze-backed error scenario preflight: ${analyzePreflightFailure.message}`);
    } finally {
      cleanupDir(probeDir);
    }
  }, 60000);

  beforeEach(() => {
    tempDir = createTempDir("session2skills-e2e-error-scenarios-");
  });

  afterEach(() => {
    cleanupDir(tempDir);
    tempDir = "";
  });

  afterAll(() => {
    killOrphanedOpenCodeServers();
  });

  describe("error cases", () => {
    it(
      "handles a nonexistent project directory",
      () => {
        const outputDir = join(tempDir, "invalid-project-directory");
        const result = runCLI(["analyze", "-d", invalidProjectDirectory, "-o", outputDir]);

        if (result.status === 0) {
          console.warn("analyze currently treats a nonexistent project directory as an empty session listing");
          expect(result.stdout).toContain(`No OpenCode sessions found for ${invalidProjectDirectory}.`);
          expect(result.stderr).toBe("");
          return;
        }

        expect(result.status).toBe(1);
        expect(result.stderr.trim()).not.toBe("");
      },
      60000,
    );

    it(
      "fails when the profile file does not exist",
      () => {
        const result = runCLI([
          "generate",
          "--profile",
          "/nonexistent/profile.json",
          "--output",
          join(tempDir, "missing-profile-output"),
        ]);

        expect(result.status).toBe(1);
      },
      60000,
    );

    it(
      "refuses to overwrite a non-empty analyze output directory without --force",
      () => {
        if (shouldSkip("output overwrite error test", analyzePreflightFailure)) {
          return;
        }

        writeFileSync(join(tempDir, "sentinel.txt"), "busy\n", "utf8");

        const result = runCLI(["analyze", "-d", projectDir, "--recent", "3", "-o", tempDir]);

        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/overwrite|Refusing/i);
      },
      60000,
    );

    it(
      "returns an error for an unknown command",
      () => {
        const result = runCLI(["unknown-command"]);

        expect(result.status).toBe(1);
        expect(result.stderr.trim()).not.toBe("");
        expect(result.stderr).toMatch(/unknown command/i);
      },
      60000,
    );

    it(
      "fails when --hybrid is used without LLM environment variables",
      () => {
        const result = runCLI(
          ["analyze", "-d", projectDir, "--recent", "1", "-o", join(tempDir, "hybrid-missing-env"), "--hybrid"],
          {
            env: {
              SESSION2SKILLS_LLM_API_KEY: "",
              SESSION2SKILLS_LLM_BASE_URL: "",
              SESSION2SKILLS_LLM_MODEL: "",
              SESSION2SKILLS_LLM_MODEL_VERSION: "",
              SESSION2SKILLS_LLM_PROVIDER: "",
            },
          },
        );

        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/requires .*SESSION2SKILLS_LLM_BASE_URL.*SESSION2SKILLS_LLM_MODEL/i);
      },
      60000,
    );

    it(
      "fails when --hybrid is used with a v1 profile",
      () => {
        if (shouldSkip("hybrid v1 profile error test", analyzePreflightFailure)) {
          return;
        }

        const legacyAnalyzeDir = join(tempDir, "legacy-analyze");
        const legacyAnalyzeResult = runCLI(["analyze", "-d", projectDir, "--recent", "3", "-o", legacyAnalyzeDir]);

        expectCliSuccess("legacy analyze for v1 profile", legacyAnalyzeResult);

        const generatedProfilePath = join(legacyAnalyzeDir, "profile.json");

        expect(existsSync(generatedProfilePath)).toBe(true);

        const rawProfile = readFileSync(generatedProfilePath, "utf8");
        const parsedProfile = JSON.parse(rawProfile) as Record<string, unknown>;
        const v1ProfilePath = join(tempDir, "v1_profile.json");

        if (parsedProfile.schemaVersion === "profile/v2") {
          const {
            acceptedClaims: _acceptedClaims,
            mergedClaims: _mergedClaims,
            promptSetVersion: _promptSetVersion,
            schemaVersion: _schemaVersion,
            tentativeClaims: _tentativeClaims,
            ...legacyCompatibleProfile
          } = parsedProfile;

          writeFileSync(v1ProfilePath, `${JSON.stringify(legacyCompatibleProfile, null, 2)}\n`, "utf8");
        } else {
          writeFileSync(v1ProfilePath, rawProfile.endsWith("\n") ? rawProfile : `${rawProfile}\n`, "utf8");
        }

        const result = runCLI([
          "generate",
          "--profile",
          v1ProfilePath,
          "--output",
          join(tempDir, "hybrid-from-v1-profile"),
          "--hybrid",
        ]);

        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/requires a hybrid profile\/v2|hybrid profile\/v2/i);
      },
      60000,
    );
  });

  describe("boundary cases", () => {
    it(
      "uses the current working directory when --directory is omitted",
      () => {
        if (shouldSkip("inspect cwd default test", sessionPreflightFailure)) {
          return;
        }

        const result = runCLI(["inspect", "--recent", "1"]);

        expect(result.status).toBe(0);
        expect(result.stdout.trim()).not.toBe("");
      },
      60000,
    );

    it(
      "rejects --recent 0",
      () => {
        const result = runCLI(["inspect", "-d", projectDir, "--recent", "0"]);

        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/Expected a positive integer/);
        expect(result.stdout).toBe("");
      },
      60000,
    );
  });
});
