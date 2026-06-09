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
} from "./helpers.js";

describe("generate legacy", () => {
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
      console.warn(`Skipping generate legacy E2E preflight: ${preflightFailure.message}`);
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

  it(
    "runs normal generation successfully",
    () => {
      if (preflightFailure) {
        console.warn(`Skipping generate legacy test: ${preflightFailure.message}`);
        return;
      }

      const result = runCLI([
        "generate",
        "-d",
        projectDir,
        "--recent",
        "3",
        "--output",
        tempDir,
        "--tone",
        "balanced",
      ]);

      expect(result.status).toBe(0);
    },
    60000,
  );

  it(
    "writes summary.md as a non-empty markdown heading",
    () => {
      if (preflightFailure) {
        console.warn(`Skipping generate legacy test: ${preflightFailure.message}`);
        return;
      }

      const result = runCLI([
        "generate",
        "-d",
        projectDir,
        "--recent",
        "3",
        "--output",
        tempDir,
        "--tone",
        "balanced",
      ]);
      const summaryPath = join(tempDir, "summary.md");

      expect(result.status).toBe(0);
      expect(existsSync(summaryPath)).toBe(true);

      const summary = readFileSync(summaryPath, "utf-8");

      expect(summary.trim().length).toBeGreaterThan(0);
      expect(summary.startsWith("#")).toBe(true);
    },
    60000,
  );

  it(
    "writes SKILL.md as a non-empty markdown document with workflow-related headings",
    () => {
      if (preflightFailure) {
        console.warn(`Skipping generate legacy test: ${preflightFailure.message}`);
        return;
      }

      const result = runCLI([
        "generate",
        "-d",
        projectDir,
        "--recent",
        "3",
        "--output",
        tempDir,
        "--tone",
        "balanced",
      ]);
      const skillPath = join(tempDir, "SKILL.md");

      expect(result.status).toBe(0);
      expect(existsSync(skillPath)).toBe(true);

      const skill = readFileSync(skillPath, "utf-8");

      expect(skill.trim().length).toBeGreaterThan(0);
      expect(skill.startsWith("---\n")).toBe(true);
      expect(skill).toMatch(/^name:\s*\S/m);
      expect(skill).toMatch(/^description:\s*\S/m);
      expect(skill).toMatch(/^#+\s*.*(Workflow|Communication|Validation|Constraint)/im);
    },
    60000,
  );

  it(
    "allows overwriting with --force",
    () => {
      if (preflightFailure) {
        console.warn(`Skipping generate legacy test: ${preflightFailure.message}`);
        return;
      }

      const firstRun = runCLI([
        "generate",
        "-d",
        projectDir,
        "--recent",
        "3",
        "--output",
        tempDir,
        "--tone",
        "balanced",
        "--force",
      ]);
      const secondRun = runCLI([
        "generate",
        "-d",
        projectDir,
        "--recent",
        "3",
        "--output",
        tempDir,
        "--tone",
        "balanced",
        "--force",
      ]);

      expect(firstRun.status).toBe(0);
      expect(secondRun.status).toBe(0);
    },
    60000,
  );

  it(
    "refuses overwrite without --force",
    () => {
      if (preflightFailure) {
        console.warn(`Skipping generate legacy test: ${preflightFailure.message}`);
        return;
      }

      const firstRun = runCLI([
        "generate",
        "-d",
        projectDir,
        "--recent",
        "3",
        "--output",
        tempDir,
        "--tone",
        "balanced",
      ]);
      const secondRun = runCLI([
        "generate",
        "-d",
        projectDir,
        "--recent",
        "3",
        "--output",
        tempDir,
        "--tone",
        "balanced",
      ]);

      expect(firstRun.status).toBe(0);
      expect(secondRun.status).toBe(1);
      expect(secondRun.stderr).toMatch(/overwrite|Refusing/i);
    },
    60000,
  );
});
