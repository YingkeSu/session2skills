import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createClaudeSessionProvider } from "../../../src/adapters/claude/sessions.js";
import { encodeCwd } from "../../../src/adapters/claude/encode.js";
import {
  assistantTextLine,
  linesToJsonl,
  userTextLine,
} from "../../fixtures/claude-fixtures.js";

const dirs: Array<string> = [];
afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function makeProjectTree(projectCwd: string): { root: string; projectDir: string } {
  const root = mkdtempSync(join(tmpdir(), "claude-root-"));
  dirs.push(root);
  const projectsDir = join(root, "projects");
  mkdirSync(projectsDir, { recursive: true });
  const projectDir = join(projectsDir, encodeCwd(projectCwd));
  mkdirSync(projectDir, { recursive: true });
  return { root, projectDir };
}

function makeSessionFile(
  projectDir: string,
  sessionId: string,
  entries: ReturnType<typeof userTextLine>[],
): string {
  const filePath = join(projectDir, `${sessionId}.jsonl`);
  writeFileSync(filePath, linesToJsonl(...entries), "utf8");
  return filePath;
}

describe("createClaudeSessionProvider", () => {
  it("lists recent sessions ordered by filename parse, newest mtime first", async () => {
    const cwd = "/Users/alice/my-project";
    const { root, projectDir } = makeProjectTree(cwd);
    process.env.CLAUDE_CONFIG_DIR = root;

    makeSessionFile(projectDir, "sess-old", [
      userTextLine({ sessionId: "sess-old", timestamp: "2026-05-20T10:00:00.000Z", text: "old" }),
    ]);
    makeSessionFile(projectDir, "sess-new", [
      userTextLine({ sessionId: "sess-new", timestamp: "2026-05-20T14:00:00.000Z", text: "new" }),
    ]);

    const provider = createClaudeSessionProvider();
    const sessions = await provider.listRecentSessions({ directory: cwd }, 10);

    expect(sessions).toHaveLength(2);
    expect(sessions[0].updatedAt).toBeGreaterThanOrEqual(sessions[1].updatedAt);
    expect(sessions.map((s) => s.id).sort()).toEqual(["sess-new", "sess-old"]);
  });

  it("respects the recent limit", async () => {
    const cwd = "/Users/alice/proj";
    const { root, projectDir } = makeProjectTree(cwd);
    process.env.CLAUDE_CONFIG_DIR = root;

    makeSessionFile(projectDir, "s1", [userTextLine({ sessionId: "s1", text: "a" })]);
    makeSessionFile(projectDir, "s2", [userTextLine({ sessionId: "s2", text: "b" })]);
    makeSessionFile(projectDir, "s3", [userTextLine({ sessionId: "s3", text: "c" })]);

    const provider = createClaudeSessionProvider();
    const sessions = await provider.listRecentSessions({ directory: cwd }, 1);
    expect(sessions).toHaveLength(1);
  });

  it("prefers sessions-index.json when present", async () => {
    const cwd = "/Users/alice/indexed";
    const { root, projectDir } = makeProjectTree(cwd);
    process.env.CLAUDE_CONFIG_DIR = root;

    makeSessionFile(projectDir, "real-1", [userTextLine({ sessionId: "real-1", text: "hi" })]);

    const index = {
      version: 1,
      entries: [
        {
          sessionId: "from-index",
          firstPrompt: "Indexed prompt",
          modified: "2026-05-20T12:00:00.000Z",
          messageCount: 5,
          gitBranch: "main",
          isSidechain: false,
          fullPath: join(projectDir, "from-index.jsonl"),
          fileMtime: 1748431930000,
        },
      ],
    };
    writeFileSync(join(projectDir, "sessions-index.json"), JSON.stringify(index), "utf8");

    const provider = createClaudeSessionProvider();
    const sessions = await provider.listRecentSessions({ directory: cwd }, 10);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("from-index");
    expect(sessions[0].updatedAt).toBe(1748431930000);
  });

  it("returns [] when the project directory does not exist", async () => {
    const root = mkdtempSync(join(tmpdir(), "claude-empty-"));
    dirs.push(root);
    process.env.CLAUDE_CONFIG_DIR = root;

    const provider = createClaudeSessionProvider();
    const sessions = await provider.listRecentSessions({ directory: "/no/such/dir" }, 10);
    expect(sessions).toEqual([]);
  });

  it("getSession returns metadata parsed from the transcript", async () => {
    const cwd = "/Users/alice/get";
    const { root, projectDir } = makeProjectTree(cwd);
    process.env.CLAUDE_CONFIG_DIR = root;
    makeSessionFile(projectDir, "sess-get", [
      userTextLine({ sessionId: "sess-get", timestamp: "2026-05-20T09:00:00.000Z", text: "hello" }),
      assistantTextLine({ sessionId: "sess-get", timestamp: "2026-05-20T09:00:01.000Z", text: "world" }),
    ]);

    const provider = createClaudeSessionProvider();
    const session = await provider.getSession({ directory: cwd }, "sess-get");
    expect(session.id).toBe("sess-get");
    expect(session.title).toBe("hello");
    expect(session.directory).toBe("/Users/alice/my-project");
    expect(session.model?.providerID).toBe("anthropic");
  });

  it("getSession throws OpenCodeAdapterError when not found", async () => {
    const cwd = "/Users/alice/missing";
    const { root } = makeProjectTree(cwd);
    process.env.CLAUDE_CONFIG_DIR = root;
    const { OpenCodeAdapterError } = await import("../../../src/shared/errors.js");

    const provider = createClaudeSessionProvider();
    await expect(provider.getSession({ directory: cwd }, "nope")).rejects.toBeInstanceOf(
      OpenCodeAdapterError,
    );
  });

  it("getSessionMessages returns parsed messages", async () => {
    const cwd = "/Users/alice/msgs";
    const { root, projectDir } = makeProjectTree(cwd);
    process.env.CLAUDE_CONFIG_DIR = root;
    makeSessionFile(projectDir, "sess-msgs", [
      userTextLine({ sessionId: "sess-msgs", text: "ping" }),
      assistantTextLine({ sessionId: "sess-msgs", text: "pong" }),
    ]);

    const provider = createClaudeSessionProvider();
    const messages = await provider.getSessionMessages({ directory: cwd }, "sess-msgs");
    expect(messages).toHaveLength(2);
    expect(messages[0].info.role).toBe("user");
    expect(messages[1].info.role).toBe("assistant");
  });

  it("getSessionMessages applies the limit (last N)", async () => {
    const cwd = "/Users/alice/limit";
    const { root, projectDir } = makeProjectTree(cwd);
    process.env.CLAUDE_CONFIG_DIR = root;
    makeSessionFile(projectDir, "sess-limit", [
      userTextLine({ sessionId: "sess-limit", text: "one" }),
      assistantTextLine({ sessionId: "sess-limit", text: "two" }),
      userTextLine({ sessionId: "sess-limit", text: "three" }),
    ]);

    const provider = createClaudeSessionProvider();
    const messages = await provider.getSessionMessages({ directory: cwd }, "sess-limit", 1);
    expect(messages).toHaveLength(1);
    expect(messages[0].info.role).toBe("user");
  });

  it("getSessionDiff always returns an empty array", async () => {
    const provider = createClaudeSessionProvider();
    const diff = await provider.getSessionDiff({ directory: "/anywhere" }, "any");
    expect(diff).toEqual([]);
  });

  it("close is a no-op that resolves", async () => {
    const provider = createClaudeSessionProvider();
    await expect(provider.close?.()).resolves.toBeUndefined();
  });
});
