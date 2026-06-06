import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { CliUsageError } from "../src/shared/errors.js";
import {
  getDefaultGeneratedSkillsDirectory,
  getDefaultRunsDirectory,
  resolveGeneratedSkillsDirectory,
  resolveProjectDirectory,
  resolveRunsDirectory,
  validateProjectDirectory,
} from "../src/shared/paths.js";

const tempRoot = mkdtempSync(path.join(os.tmpdir(), "session2skills-paths-"));

afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("resolveProjectDirectory", () => {
  it("returns cwd when no directory is provided", () => {
    expect(resolveProjectDirectory()).toBe(process.cwd());
  });

  it("resolves relative paths to absolute", () => {
    const result = resolveProjectDirectory(".");
    expect(path.isAbsolute(result)).toBe(true);
  });

  it("resolves absolute paths as-is", () => {
    expect(resolveProjectDirectory("/tmp")).toBe("/tmp");
  });
});

describe("validateProjectDirectory", () => {
  it("returns the directory path for valid directories", () => {
    const dir = mkdtempSync(path.join(tempRoot, "valid-"));
    expect(validateProjectDirectory(dir)).toBe(dir);
  });

  it("throws CliUsageError for nonexistent paths", () => {
    expect(() => validateProjectDirectory("/nonexistent/path/that/does/not/exist")).toThrow(CliUsageError);
    try {
      validateProjectDirectory("/nonexistent/path/that/does/not/exist");
    } catch (error) {
      expect((error as CliUsageError).message).toContain("does not exist");
    }
  });

  it("throws CliUsageError for file paths", () => {
    const filePath = path.join(tempRoot, "file.txt");
    writeFileSync(filePath, "test");
    try {
      expect(() => validateProjectDirectory(filePath)).toThrow(CliUsageError);
      validateProjectDirectory(filePath);
    } catch (error) {
      expect((error as CliUsageError).message).toContain("Not a directory");
    }
  });

  it("throws CliUsageError with permission denied for EACCES", () => {
    const dir = mkdtempSync(path.join(tempRoot, "noperm-"));
    chmodSync(dir, 0o000);
    try {
      try {
        // statSync needs execute permission on every path component;
        // chmod 0o000 removes it, so accessing a child path triggers EACCES.
        validateProjectDirectory(path.join(dir, "child"));
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(CliUsageError);
        expect((error as CliUsageError).message).toContain("Permission denied");
      }
    } finally {
      chmodSync(dir, 0o755);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("getDefaultRunsDirectory", () => {
  it("returns the expected path", () => {
    expect(getDefaultRunsDirectory("/project")).toBe("/project/.session2skills/runs");
  });
});

describe("getDefaultGeneratedSkillsDirectory", () => {
  it("returns the expected path", () => {
    expect(getDefaultGeneratedSkillsDirectory("/project")).toBe("/project/generated-skills");
  });
});

describe("resolveRunsDirectory", () => {
  it("returns default when no output directory is given", () => {
    expect(resolveRunsDirectory("/project")).toBe("/project/.session2skills/runs");
  });

  it("resolves custom output directory", () => {
    const result = resolveRunsDirectory("/project", "/custom/output");
    expect(result).toBe(path.resolve("/custom/output"));
  });
});

describe("resolveGeneratedSkillsDirectory", () => {
  it("returns default when no output directory is given", () => {
    expect(resolveGeneratedSkillsDirectory("/project")).toBe("/project/generated-skills");
  });

  it("resolves custom output directory", () => {
    const result = resolveGeneratedSkillsDirectory("/project", "/custom/output");
    expect(result).toBe(path.resolve("/custom/output"));
  });
});
