import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { writeDirectoryArtifacts } from "../src/persist/staged-directory-write.js";
import { writeGeneratedArtifacts } from "../src/persist/generated-artifacts.js";
import { CliUsageError } from "../src/shared/errors.js";

const FIRST_VALID_SKILL = `---
name: first-skill
description: Use when testing first generated skill output.
---

# First Skill
`;

const SECOND_VALID_SKILL = `---
name: second-skill
description: Use when testing overwritten generated skill output.
---

# Second Skill
`;

describe("writeDirectoryArtifacts", () => {
  it("writes multiple files atomically", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "session2skills-artifacts-"));
    const outputDirectory = path.join(root, "test-output");

    const resultPaths = await writeDirectoryArtifacts({
      outputDirectory,
      force: false,
      files: {
        "file1.txt": "content1",
        "file2.txt": "content2",
        "file3.txt": "content3",
      },
    });

    expect(resultPaths).toEqual({
      "file1.txt": path.join(outputDirectory, "file1.txt"),
      "file2.txt": path.join(outputDirectory, "file2.txt"),
      "file3.txt": path.join(outputDirectory, "file3.txt"),
    });

    await expect(readFile(resultPaths["file1.txt"], "utf8")).resolves.toBe("content1");
    await expect(readFile(resultPaths["file2.txt"], "utf8")).resolves.toBe("content2");
    await expect(readFile(resultPaths["file3.txt"], "utf8")).resolves.toBe("content3");
  });

  it("supports nested subpaths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "session2skills-nested-"));
    const outputDirectory = path.join(root, "nested-output");

    const resultPaths = await writeDirectoryArtifacts({
      outputDirectory,
      force: false,
      files: {
        "root.txt": "root content",
        "subdir/file1.txt": "nested content 1",
        "subdir/deep/file2.txt": "deeply nested content",
      },
    });

    await expect(readFile(resultPaths["root.txt"], "utf8")).resolves.toBe("root content");
    await expect(readFile(resultPaths["subdir/file1.txt"], "utf8")).resolves.toBe("nested content 1");
    await expect(readFile(resultPaths["subdir/deep/file2.txt"], "utf8")).resolves.toBe("deeply nested content");
  });

  it("rejects directory traversal attempts", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "session2skills-traversal-"));
    const outputDirectory = path.join(root, "protected-output");

    await expect(
      writeDirectoryArtifacts({
        outputDirectory,
        force: false,
        files: {
          "../escape.txt": "malicious content",
        },
      }),
    ).rejects.toBeInstanceOf(CliUsageError);

    await expect(
      writeDirectoryArtifacts({
        outputDirectory,
        force: false,
        files: {
          "subdir/../../escape.txt": "malicious content",
        },
      }),
    ).rejects.toBeInstanceOf(CliUsageError);
  });

  it("rejects absolute paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "session2skills-absolute-"));
    const outputDirectory = path.join(root, "output");

    await expect(
      writeDirectoryArtifacts({
        outputDirectory,
        force: false,
        files: {
          "/etc/passwd": "malicious content",
        },
      }),
    ).rejects.toBeInstanceOf(CliUsageError);
  });

  it("refuses overwrite without force and supports force", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "session2skills-overwrite-"));
    const outputDirectory = path.join(root, "output");

    await writeDirectoryArtifacts({
      outputDirectory,
      force: false,
      files: {
        "file.txt": "first",
      },
    });

    await expect(
      writeDirectoryArtifacts({
        outputDirectory,
        force: false,
        files: {
          "file.txt": "second",
        },
      }),
    ).rejects.toBeInstanceOf(CliUsageError);

    await writeDirectoryArtifacts({
      outputDirectory,
      force: true,
      files: {
        "file.txt": "second",
      },
    });

    await expect(readFile(path.join(outputDirectory, "file.txt"), "utf8")).resolves.toBe("second");
  });

  it("writes expanded hybrid artifact set", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "session2skills-hybrid-"));
    const outputDirectory = path.join(root, "hybrid-run");

    const artifacts = {
      "normalized.json": JSON.stringify([{ test: "data" }]),
      "profile.json": JSON.stringify({ version: 2 }),
      "evidence-index.json": JSON.stringify({ items: [] }),
      "rule-claims.json": JSON.stringify({ claims: [] }),
      "llm-session-claims.json": JSON.stringify({ sessionClaims: [] }),
      "llm-category-claims.json": JSON.stringify({ categoryClaims: [] }),
      "merged-claims.json": JSON.stringify({ merged: [] }),
      "skill-plan.json": JSON.stringify({ plan: {} }),
      "llm-traces.json": JSON.stringify({ traces: [] }),
    };

    const resultPaths = await writeDirectoryArtifacts({
      outputDirectory,
      force: false,
      files: artifacts,
    });

    const outputFiles = await readdir(outputDirectory);
    expect(outputFiles).toHaveLength(9);
    expect(outputFiles).toContain("normalized.json");
    expect(outputFiles).toContain("profile.json");
    expect(outputFiles).toContain("evidence-index.json");
    expect(outputFiles).toContain("rule-claims.json");
    expect(outputFiles).toContain("llm-session-claims.json");
    expect(outputFiles).toContain("llm-category-claims.json");
    expect(outputFiles).toContain("merged-claims.json");
    expect(outputFiles).toContain("skill-plan.json");
    expect(outputFiles).toContain("llm-traces.json");

    await expect(readFile(resultPaths["normalized.json"], "utf8")).resolves.toBe(artifacts["normalized.json"]);
    await expect(readFile(resultPaths["profile.json"], "utf8")).resolves.toBe(artifacts["profile.json"]);
  });
});

describe("writeGeneratedArtifacts", () => {
  it("refuses overwrite without force and supports force", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "session2skills-generated-"));
    const outputDirectory = path.join(root, "skill-output");

    await writeGeneratedArtifacts({
      outputDirectory,
      summary: "first summary",
      skill: FIRST_VALID_SKILL,
      force: false,
    });

    await expect(
      writeGeneratedArtifacts({
        outputDirectory,
        summary: "second summary",
        skill: SECOND_VALID_SKILL,
        force: false,
      }),
    ).rejects.toBeInstanceOf(CliUsageError);

    await writeGeneratedArtifacts({
      outputDirectory,
      summary: "second summary",
      skill: SECOND_VALID_SKILL,
      force: true,
    });

    await expect(readFile(path.join(outputDirectory, "summary.md"), "utf8")).resolves.toBe("second summary");
    await expect(readFile(path.join(outputDirectory, "SKILL.md"), "utf8")).resolves.toBe(SECOND_VALID_SKILL);
  });
});
