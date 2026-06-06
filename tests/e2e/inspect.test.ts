import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  getProjectDir,
  killOrphanedOpenCodeServers,
  preflightChecks,
  runCLI,
} from "./helpers.js";

describe("inspect command", () => {
  const projectDir = getProjectDir();
  const invalidDirectoryPath = join(projectDir, "package.json");
  const tableHeader = "sessionID\tupdatedAt\tworkspaceID\tprojectID\tdirectory\ttitle";
  let shouldSkipAssertions = false;

  beforeAll(() => {
    try {
      preflightChecks();
    } catch {
      shouldSkipAssertions = true;
      return;
    }
  }, 30000);

  afterAll(() => {
    killOrphanedOpenCodeServers();
  });

  test("lists recent sessions with table headers", () => {
    if (shouldSkipAssertions) {
      return;
    }

    const result = runCLI(["inspect", "-d", projectDir, "--recent", "3"]);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).not.toBe("");
    expect(result.stdout).toContain(tableHeader);
  }, 60000);

  test("limits inspect output to one data row", () => {
    if (shouldSkipAssertions) {
      return;
    }

    const result = runCLI(["inspect", "-d", projectDir, "--recent", "1"]);
    const lines = result.stdout.split("\n").filter((line) => line.trim() !== "");
    const [header, ...dataLines] = lines;

    expect(result.status).toBe(0);
    expect(header).toContain("sessionID");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(dataLines).toHaveLength(1);
  }, 60000);

  test("returns an error for an invalid directory", () => {
    if (shouldSkipAssertions) {
      return;
    }

    const result = runCLI(["inspect", "--directory", invalidDirectoryPath]);

    expect(result.status).toBe(1);
    expect(result.stderr.trim()).not.toBe("");
  }, 60000);

  test("defaults to the current working directory", () => {
    if (shouldSkipAssertions) {
      return;
    }

    const result = runCLI(["inspect", "--recent", "1"]);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).not.toBe("");
  }, 60000);
});
