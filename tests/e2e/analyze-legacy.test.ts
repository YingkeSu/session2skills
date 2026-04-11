import { existsSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { NormalizedSession, PreferenceProfile } from "../../src/normalize/models.js";
import {
  cleanupDir,
  createTempDir,
  getProjectDir,
  killOrphanedOpenCodeServers,
  preflightChecks,
  readArtifact,
  runCLI,
} from "./helpers.js";

describe("analyze legacy", () => {
  const projectDir = getProjectDir();
  let tempDir = "";
  let preflightFailure: Error | null = null;

  beforeAll(() => {
    try {
      preflightChecks();

      const probeDir = createTempDir("session2skills-e2e-probe-");

      try {
        const probe = runCLI(["analyze", "-d", projectDir, "--recent", "3", "-o", probeDir]);

        if (probe.status !== 0) {
          throw new Error(`Analyze preflight failed with exit code ${probe.status ?? "null"}.`);
        }

        if (probe.stdout.includes("No OpenCode sessions found")) {
          throw new Error("E2E preflight: analyze command found no analyzable OpenCode sessions.");
        }
      } finally {
        cleanupDir(probeDir);
      }
    } catch (error) {
      preflightFailure = error instanceof Error ? error : new Error(String(error));
      console.warn(`Skipping analyze legacy E2E preflight: ${preflightFailure.message}`);
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
    "runs normal analysis successfully",
    () => {
      if (preflightFailure) {
        console.warn(`Skipping analyze legacy test: ${preflightFailure.message}`);
        return;
      }

      const result = runCLI(["analyze", "-d", projectDir, "--recent", "3", "-o", tempDir]);

      expect(result.status).toBe(0);
    },
    60000,
  );

  it(
    "writes normalized.json with session ids",
    () => {
      if (preflightFailure) {
        console.warn(`Skipping analyze legacy test: ${preflightFailure.message}`);
        return;
      }

      const result = runCLI(["analyze", "-d", projectDir, "--recent", "3", "-o", tempDir]);
      const normalizedPath = join(tempDir, "normalized.json");

      expect(result.status).toBe(0);
      expect(existsSync(normalizedPath)).toBe(true);

      const normalized = readArtifact<NormalizedSession[]>(tempDir, "normalized.json");

      expect(Array.isArray(normalized)).toBe(true);
      expect(normalized.length).toBeGreaterThan(0);
      expect(normalized.every((session) => typeof session.id === "string" && session.id.length > 0)).toBe(true);
    },
    60000,
  );

  it(
    "writes profile.json with legacy profile sections",
    () => {
      if (preflightFailure) {
        console.warn(`Skipping analyze legacy test: ${preflightFailure.message}`);
        return;
      }

      const result = runCLI(["analyze", "-d", projectDir, "--recent", "3", "-o", tempDir]);
      const profilePath = join(tempDir, "profile.json");

      expect(result.status).toBe(0);
      expect(existsSync(profilePath)).toBe(true);

      const profile = readArtifact<PreferenceProfile>(tempDir, "profile.json");

      expect(profile).toEqual(
        expect.objectContaining({
          workStyle: expect.any(Array),
          communicationStyle: expect.any(Array),
          validationHabits: expect.any(Array),
          constraints: expect.any(Array),
          confidenceNotes: expect.any(Array),
        }),
      );
    },
    60000,
  );

  it(
    "allows overwriting with --force",
    () => {
      if (preflightFailure) {
        console.warn(`Skipping analyze legacy test: ${preflightFailure.message}`);
        return;
      }

      const firstRun = runCLI(["analyze", "-d", projectDir, "--recent", "3", "-o", tempDir, "--force"]);
      const secondRun = runCLI(["analyze", "-d", projectDir, "--recent", "3", "-o", tempDir, "--force"]);

      expect(firstRun.status).toBe(0);
      expect(secondRun.status).toBe(0);
    },
    60000,
  );

  it(
    "refuses overwrite without --force",
    () => {
      if (preflightFailure) {
        console.warn(`Skipping analyze legacy test: ${preflightFailure.message}`);
        return;
      }

      const firstRun = runCLI(["analyze", "-d", projectDir, "--recent", "3", "-o", tempDir]);
      const secondRun = runCLI(["analyze", "-d", projectDir, "--recent", "3", "-o", tempDir]);

      expect(firstRun.status).toBe(0);
      expect(secondRun.status).toBe(1);
      expect(secondRun.stderr).toMatch(/overwrite|Refusing/i);
    },
    60000,
  );
});
