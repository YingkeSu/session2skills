import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listClaudeProjects } from "../../../src/adapters/claude/discover.js";
import { encodeCwd } from "../../../src/adapters/claude/encode.js";
import {
  linesToJsonl,
  userTextLine,
} from "../../fixtures/claude-fixtures.js";

const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
const dirs: Array<string> = [];

beforeEach(() => {
  delete process.env.CLAUDE_CONFIG_DIR;
});

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
  if (originalConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR;
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
  }
});

function makeConfigRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "claude-discover-"));
  dirs.push(root);
  mkdirSync(join(root, "projects"), { recursive: true });
  return root;
}

function makeProject(configRoot: string, cwd: string): string {
  const projectDir = join(configRoot, "projects", encodeCwd(cwd));
  mkdirSync(projectDir, { recursive: true });
  return projectDir;
}

function writeSession(
  projectDir: string,
  sessionId: string,
  entries: ReturnType<typeof userTextLine>[],
): void {
  writeFileSync(
    join(projectDir, `${sessionId}.jsonl`),
    linesToJsonl(...entries),
    "utf8",
  );
}

describe("listClaudeProjects", () => {
  it("returns one entry when one project exists", () => {
    const root = makeConfigRoot();
    process.env.CLAUDE_CONFIG_DIR = root;
    const cwd = "/Users/alice/my-project";
    const projectDir = makeProject(root, cwd);
    writeSession(projectDir, "sess-1", [
      userTextLine({ sessionId: "sess-1", cwd, text: "hello" }),
    ]);

    const result = listClaudeProjects();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      adapter: "claude",
      encodedDir: encodeCwd(cwd),
      projectPath: cwd,
      sessionCount: 1,
    });
  });

  it("returns empty array when projects directory is empty", () => {
    const root = makeConfigRoot();
    process.env.CLAUDE_CONFIG_DIR = root;

    const result = listClaudeProjects();

    expect(result).toEqual([]);
  });

  it("returns empty array when config directory does not exist", () => {
    process.env.CLAUDE_CONFIG_DIR = join(tmpdir(), "claude-nonexistent-" + Date.now());

    const result = listClaudeProjects();

    expect(result).toEqual([]);
  });

  it("returns all projects with sessionCount and lastModified aggregated per project", () => {
    const root = makeConfigRoot();
    process.env.CLAUDE_CONFIG_DIR = root;
    const cwdA = "/Users/alice/project-a";
    const cwdB = "/Users/alice/project-b";
    const dirA = makeProject(root, cwdA);
    const dirB = makeProject(root, cwdB);
    writeSession(dirA, "a-1", [userTextLine({ sessionId: "a-1", cwd: cwdA, text: "a1" })]);
    writeSession(dirA, "a-2", [userTextLine({ sessionId: "a-2", cwd: cwdA, text: "a2" })]);
    writeSession(dirB, "b-1", [userTextLine({ sessionId: "b-1", cwd: cwdB, text: "b1" })]);

    const futureFile = join(dirB, "b-future.jsonl");
    writeFileSync(futureFile, linesToJsonl(userTextLine({ sessionId: "b-future", cwd: cwdB, text: "future" })), "utf8");
    const futureMtimeMs = statSync(futureFile).mtimeMs;

    const result = listClaudeProjects();
    const byEncoded = Object.fromEntries(result.map((p) => [p.encodedDir, p]));

    expect(result).toHaveLength(2);
    const projA = byEncoded[encodeCwd(cwdA)];
    const projB = byEncoded[encodeCwd(cwdB)];
    expect(projA.sessionCount).toBe(2);
    expect(projB.sessionCount).toBe(2);
    expect(new Date(projB.lastModified).getTime()).toBeCloseTo(futureMtimeMs, -2);
    expect(new Date(projA.lastModified).getTime()).toBeLessThan(futureMtimeMs);
  });

  it("falls back to encodedDir as projectPath when transcript has no cwd", () => {
    const root = makeConfigRoot();
    process.env.CLAUDE_CONFIG_DIR = root;
    const encoded = "-Users-alice-no-cwd";
    const projectDir = join(root, "projects", encoded);
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, "s1.jsonl"),
      linesToJsonl({
        type: "user",
        sessionId: "s1",
        uuid: "u1",
        timestamp: "2026-05-20T14:30:00.000Z",
        message: { role: "user", content: "no cwd here" },
      } as ReturnType<typeof userTextLine>),
      "utf8",
    );

    const result = listClaudeProjects();

    expect(result).toHaveLength(1);
    expect(result[0].projectPath).toBe(encoded);
  });

  it("scans past metadata-only leading lines to find cwd", () => {
    const root = makeConfigRoot();
    process.env.CLAUDE_CONFIG_DIR = root;
    const cwd = "/Users/alice/metadata-first";
    const projectDir = makeProject(root, cwd);
    const metaLine = {
      type: "permission-mode",
      permissionMode: "default",
      sessionId: "s1",
    } as ReturnType<typeof userTextLine>;
    writeFileSync(
      join(projectDir, "s1.jsonl"),
      linesToJsonl(
        metaLine,
        metaLine,
        userTextLine({ sessionId: "s1", cwd, text: "real cwd here" }),
      ),
      "utf8",
    );

    const result = listClaudeProjects();

    expect(result).toHaveLength(1);
    expect(result[0].projectPath).toBe(cwd);
  });
});
