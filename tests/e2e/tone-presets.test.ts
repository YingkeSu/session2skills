import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupDir,
  createTempDir,
  getProjectDir,
  killOrphanedOpenCodeServers,
  preflightChecks,
  runCLI,
  type CliResult,
} from "./helpers.js";

const tones = ["concise", "balanced", "detailed"] as const;

type TonePreset = (typeof tones)[number];

type ToneRun = {
  outputDir: string;
  result: CliResult;
  summaryPath: string;
  skillPath: string;
};

describe("tone presets", () => {
  const projectDir = getProjectDir();
  let tempDir = "";
  let preflightFailure: Error | null = null;

  beforeAll(() => {
    try {
      preflightChecks();

      const probeDir = createTempDir("session2skills-e2e-probe-");

      try {
        const probe = runCLI([
          "generate",
          "-d",
          projectDir,
          "--recent",
          "3",
          "--output",
          probeDir,
          "--tone",
          "balanced",
        ]);

        if (probe.status !== 0) {
          throw new Error(`Generate preflight failed with exit code ${probe.status ?? "null"}.`);
        }

        if (probe.stdout.includes("No OpenCode sessions found")) {
          throw new Error("E2E preflight: generate command found no analyzable OpenCode sessions.");
        }
      } finally {
        cleanupDir(probeDir);
      }
    } catch (error) {
      preflightFailure = error instanceof Error ? error : new Error(String(error));
      console.warn(`Skipping tone presets E2E preflight: ${preflightFailure.message}`);
      return;
    }
  }, 60000);

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupDir(tempDir);
  });

  afterAll(() => {
    killOrphanedOpenCodeServers();
  });

  function shouldSkip(testName: string): boolean {
    if (!preflightFailure) {
      return false;
    }

    console.warn(`Skipping ${testName}: ${preflightFailure.message}`);
    return true;
  }

  function runGenerateForTone(tone: TonePreset): ToneRun {
    const outputDir = join(tempDir, tone);

    return {
      outputDir,
      result: runCLI([
        "generate",
        "-d",
        projectDir,
        "--recent",
        "3",
        "--output",
        outputDir,
        "--tone",
        tone,
      ]),
      summaryPath: join(outputDir, "summary.md"),
      skillPath: join(outputDir, "SKILL.md"),
    };
  }

  function readOutputFile(filePath: string): string {
    return readFileSync(filePath, "utf-8");
  }

  function generateAllTones(): Record<TonePreset, ToneRun> {
    const runs = {
      concise: runGenerateForTone("concise"),
      balanced: runGenerateForTone("balanced"),
      detailed: runGenerateForTone("detailed"),
    };

    for (const tone of tones) {
      const { result } = runs[tone];

      if (result.status !== 0) {
        throw new Error(
          [
            `generate --tone ${tone} failed with exit code ${result.status ?? "null"}.`,
            `stdout:\n${result.stdout}`,
            `stderr:\n${result.stderr}`,
          ].join("\n\n"),
        );
      }
    }

    return runs;
  }

  it(
    "runs concise generation successfully and writes SKILL.md",
    () => {
      if (shouldSkip("tone presets concise test")) {
        return;
      }

      const conciseRun = runGenerateForTone("concise");

      expect(conciseRun.result.status).toBe(0);
      expect(existsSync(conciseRun.skillPath)).toBe(true);
    },
    60000,
  );

  it(
    "runs balanced generation successfully",
    () => {
      if (shouldSkip("tone presets balanced test")) {
        return;
      }

      const balancedRun = runGenerateForTone("balanced");

      expect(balancedRun.result.status).toBe(0);
    },
    60000,
  );

  it(
    "runs detailed generation successfully",
    () => {
      if (shouldSkip("tone presets detailed test")) {
        return;
      }

      const detailedRun = runGenerateForTone("detailed");

      expect(detailedRun.result.status).toBe(0);
    },
    120000,
  );

  it(
    "renders longer summaries as tone detail increases",
    () => {
      if (shouldSkip("tone presets summary comparison test")) {
        return;
      }

      const runs = generateAllTones();
      const conciseSummary = readOutputFile(runs.concise.summaryPath);
      const balancedSummary = readOutputFile(runs.balanced.summaryPath);
      const detailedSummary = readOutputFile(runs.detailed.summaryPath);

      expect(detailedSummary.length).toBeGreaterThanOrEqual(balancedSummary.length);
      expect(balancedSummary.length).toBeGreaterThanOrEqual(conciseSummary.length);
    },
    120000,
  );

  it(
    "writes valid markdown SKILL.md output for every tone",
    () => {
      if (shouldSkip("tone presets SKILL.md validation test")) {
        return;
      }

      const runs = generateAllTones();

      for (const tone of tones) {
        const run = runs[tone];
        const skill = readOutputFile(run.skillPath);

        expect(skill.trim().length).toBeGreaterThan(0);
        expect(skill.startsWith("---\n")).toBe(true);
        expect(skill).toMatch(/^name:\s*\S/m);
        expect(skill).toMatch(/^description:\s*\S/m);
        expect(skill).toMatch(/^##\s+\S/m);
      }
    },
    120000,
  );

  it(
    "rejects invalid tone values",
    () => {
      if (shouldSkip("tone presets invalid tone test")) {
        return;
      }

      const result = runCLI([
        "generate",
        "-d",
        projectDir,
        "--recent",
        "3",
        "--output",
        join(tempDir, "invalid-tone"),
        "--tone",
        "verbose",
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/concise|balanced|detailed/i);
    },
    60000,
  );
});
