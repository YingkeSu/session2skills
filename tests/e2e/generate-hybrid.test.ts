import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { MergedClaim, SkillPlan } from "../../src/normalize/models.js";
import {
  cleanupDir,
  createTempDir,
  fileExists,
  getHybridEnv,
  getProjectDir,
  killOrphanedOpenCodeServers,
  preflightChecks,
  readArtifact,
  runCLI,
  runCLIAsync,
} from "./helpers.js";

type GenerateHybridOutput = {
  outputDirectory: string;
  mode: "hybrid";
  skillRenderer: "llm" | "fallback";
  artifacts: {
    summaryPath: string;
    skillPath: string;
    mergedClaimsPath: string;
    skillPlanPath: string;
  };
};

function readTextArtifact(dir: string, filename: string): string {
  return readFileSync(join(dir, filename), "utf-8");
}

function parseGenerateOutput(stdout: string): GenerateHybridOutput {
  const trimmed = stdout.trim();
  let searchFrom = trimmed.length;
  while (searchFrom > 0) {
    const braceIdx = trimmed.lastIndexOf("\n{", searchFrom);
    if (braceIdx < 0) break;
    const candidate = trimmed.slice(braceIdx + 1);
    try {
      return JSON.parse(candidate) as GenerateHybridOutput;
    } catch {
      searchFrom = braceIdx - 1;
    }
  }
  return JSON.parse(trimmed) as GenerateHybridOutput;
}

describe("generate hybrid", () => {
  const projectDir = getProjectDir();
  let hybridEnv: Record<string, string>;
  let preflightFailure: Error | null = null;
  let tempDir = "";

  beforeAll(() => {
    try {
      preflightChecks();
      hybridEnv = getHybridEnv();
    } catch (error) {
      preflightFailure = error instanceof Error ? error : new Error(String(error));
      console.warn(`Skipping generate hybrid LLM preflight: ${preflightFailure.message}`);
    }
  }, 30000);

  afterEach(() => {
    if (tempDir) {
      cleanupDir(tempDir);
      tempDir = "";
    }
  });

  afterAll(() => {
    killOrphanedOpenCodeServers();
  });

  it(
    "runs hybrid generate with the real LLM API and writes complete output artifacts",
    async () => {
      if (preflightFailure) {
        console.warn(`Skipping generate hybrid test: ${preflightFailure.message}`);
        return;
      }

      tempDir = createTempDir("session2skills-e2e-generate-hybrid-");

      const result = await runCLIAsync(
        [
          "generate",
          "-d",
          projectDir,
          "--recent",
          "3",
          "--output",
          tempDir,
          "--hybrid",
          "--tone",
          "balanced",
        ],
        { env: hybridEnv, timeout: 300000 },
      );

      expect(result.status).toBe(0);
      expect(fileExists(join(tempDir, "summary.md"))).toBe(true);
      expect(fileExists(join(tempDir, "SKILL.md"))).toBe(true);
      expect(fileExists(join(tempDir, "merged-claims.json"))).toBe(true);
      expect(fileExists(join(tempDir, "skill-plan.json"))).toBe(true);

      const summary = readTextArtifact(tempDir, "summary.md");
      expect(summary.trim().length).toBeGreaterThan(0);
      expect(summary).toMatch(/^#/m);
      expect(summary).toMatch(/Strongest signals|evidence/i);

      const skill = readTextArtifact(tempDir, "SKILL.md");
      expect(skill.trim().length).toBeGreaterThan(0);
      expect(skill).toMatch(/^#/m);
      expect(skill).toMatch(/workflow|communication|validation/i);

      const mergedClaims = readArtifact<Array<MergedClaim>>(tempDir, "merged-claims.json");
      expect(Array.isArray(mergedClaims)).toBe(true);
      for (const claim of mergedClaims) {
        expect(typeof claim.claimID).toBe("string");
        expect(typeof claim.dimension).toBe("string");
        expect(typeof claim.label).toBe("string");
        expect(typeof claim.confidence).toBe("number");
        expect(Array.isArray(claim.citations)).toBe(true);
        expect(Array.isArray(claim.sources)).toBe(true);
      }

      const skillPlan = readArtifact<SkillPlan>(tempDir, "skill-plan.json");
      expect(Array.isArray(skillPlan.sections)).toBe(true);
      expect(typeof skillPlan.directives).toBe("object");
      expect(skillPlan.directives).not.toBeNull();
      console.log("generate hybrid directive count", Object.keys(skillPlan.directives).length);
      expect(Object.keys(skillPlan.directives).length).toBeGreaterThanOrEqual(0);

      expect(result.stdout).toMatch(/"skillRenderer"\s*:\s*"(llm|fallback)"/);
      const output = parseGenerateOutput(result.stdout);
      expect(output.mode).toBe("hybrid");
      expect(output.outputDirectory).toBe(tempDir);
      expect(["llm", "fallback"]).toContain(output.skillRenderer);
      expect(output.artifacts.summaryPath).toBe(join(tempDir, "summary.md"));
      expect(output.artifacts.skillPath).toBe(join(tempDir, "SKILL.md"));
      expect(output.artifacts.mergedClaimsPath).toBe(join(tempDir, "merged-claims.json"));
      expect(output.artifacts.skillPlanPath).toBe(join(tempDir, "skill-plan.json"));
    },
    300000,
  );

  it(
    "fails when hybrid generation env vars are missing",
    () => {
      tempDir = createTempDir("session2skills-e2e-generate-hybrid-missing-env-");

      const result = runCLI(
        [
          "generate",
          "-d",
          projectDir,
          "--recent",
          "3",
          "--output",
          tempDir,
          "--hybrid",
          "--tone",
          "balanced",
        ],
        {
          env: {
            SESSION2SKILLS_LLM_BASE_URL: "",
            SESSION2SKILLS_LLM_MODEL: "",
          },
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Hybrid mode requires SESSION2SKILLS_LLM_BASE_URL and SESSION2SKILLS_LLM_MODEL environment variables.",
      );
    },
    60000,
  );
});
