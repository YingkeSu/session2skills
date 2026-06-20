import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { createServer } from "../../src/server/app.js";
import { encodeCwd } from "../../src/adapters/claude/encode.js";
import { linesToJsonl, userTextLine } from "../fixtures/claude-fixtures.js";

const originalClaudeDir = process.env.CLAUDE_CONFIG_DIR;
const originalDbPath = process.env.SESSION2SKILLS_DB_PATH;
const originalCodexHome = process.env.CODEX_HOME;
const originalCodexSqliteHome = process.env.CODEX_SQLITE_HOME;
let tempRoot: string;
const dirs: Array<string> = [];

beforeAll(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "s2k-projects-api-"));
  dirs.push(tempRoot);
});

afterAll(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
  if (originalClaudeDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = originalClaudeDir;
  if (originalDbPath === undefined) delete process.env.SESSION2SKILLS_DB_PATH;
  else process.env.SESSION2SKILLS_DB_PATH = originalDbPath;
  if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = originalCodexHome;
  if (originalCodexSqliteHome === undefined) delete process.env.CODEX_SQLITE_HOME;
  else process.env.CODEX_SQLITE_HOME = originalCodexSqliteHome;
});

afterEach(() => {
  delete process.env.CLAUDE_CONFIG_DIR;
  delete process.env.SESSION2SKILLS_DB_PATH;
  delete process.env.CODEX_HOME;
  delete process.env.CODEX_SQLITE_HOME;
});

function makeClaudeConfigRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "claude-projects-api-"));
  dirs.push(root);
  mkdirSync(join(root, "projects"), { recursive: true });
  return root;
}

function makeProject(configRoot: string, cwd: string): string {
  const projectDir = join(configRoot, "projects", encodeCwd(cwd));
  mkdirSync(projectDir, { recursive: true });
  return projectDir;
}

function makeOpenCodeDb(root: string): { dbPath: string; db: Database.Database } {
  const dbPath = join(root, "opencode.db");
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE project (id TEXT PRIMARY KEY, worktree TEXT NOT NULL, name TEXT, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL);
    CREATE TABLE session (id TEXT PRIMARY KEY, project_id TEXT, directory TEXT NOT NULL, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL);
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, data TEXT);
    CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, data TEXT);
  `);
  return { dbPath, db };
}

function makeCodexDb(root: string): { dbPath: string; db: Database.Database } {
  const dbPath = join(root, "state_5.sqlite");
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, cwd TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
  `);
  return { dbPath, db };
}

describe("GET /api/projects", () => {
  test("returns discovered claude projects when adapter=claude", async () => {
    const configRoot = makeClaudeConfigRoot();
    process.env.CLAUDE_CONFIG_DIR = configRoot;
    const cwd = "/Users/alice/web-project";
    const projectDir = makeProject(configRoot, cwd);
    writeFileSync(
      join(projectDir, "sess-1.jsonl"),
      linesToJsonl(userTextLine({ sessionId: "sess-1", cwd, text: "hi" })),
      "utf8",
    );

    const app = createServer(join(tempRoot, "runs"), { projectDirectory: tempRoot });

    const res = await app.request("/api/projects?adapter=claude");
    expect(res.status).toBe(200);

    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      adapter: "claude",
      encodedDir: encodeCwd(cwd),
      projectPath: cwd,
      sessionCount: 1,
    });
  });

  test("returns discovered opencode projects when adapter=sqlite", async () => {
    const dbRoot = mkdtempSync(join(tmpdir(), "s2k-projects-opencode-"));
    dirs.push(dbRoot);
    const { dbPath, db } = makeOpenCodeDb(dbRoot);
    process.env.SESSION2SKILLS_DB_PATH = dbPath;
    db.prepare("INSERT INTO project (id, worktree, name, time_created, time_updated) VALUES (?, ?, ?, ?, ?)").run("p1", "/Users/alice/opencode-proj", "opencode-proj", 1000, 1000);
    db.prepare("INSERT INTO session (id, project_id, directory, time_created, time_updated) VALUES (?, ?, ?, ?, ?)").run("s1", "p1", "/Users/alice/opencode-proj", 1000, 2000);
    db.close();

    const app = createServer(join(tempRoot, "runs"), { projectDirectory: tempRoot });

    const res = await app.request("/api/projects?adapter=sqlite");
    expect(res.status).toBe(200);

    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      adapter: "sqlite",
      projectPath: "/Users/alice/opencode-proj",
      sessionCount: 1,
    });
  });

  test("returns discovered codex projects when adapter=codex", async () => {
    const dbRoot = mkdtempSync(join(tmpdir(), "s2k-projects-codex-"));
    dirs.push(dbRoot);
    const { dbPath, db } = makeCodexDb(dbRoot);
    process.env.CODEX_SQLITE_HOME = dbRoot;
    db.prepare("INSERT INTO threads (id, rollout_path, created_at, updated_at, cwd, archived) VALUES (?, ?, ?, ?, ?, ?)").run("t1", "/tmp/r.jsonl", 1700000000, 1700000500, "/Users/alice/codex-proj", 0);
    db.close();

    const app = createServer(join(tempRoot, "runs"), { projectDirectory: tempRoot });

    const res = await app.request("/api/projects?adapter=codex");
    expect(res.status).toBe(200);

    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      adapter: "codex",
      projectPath: "/Users/alice/codex-proj",
      sessionCount: 1,
    });
  });

  test("returns 400 for unknown adapter", async () => {
    const app = createServer(join(tempRoot, "runs"), { projectDirectory: tempRoot });
    const res = await app.request("/api/projects?adapter=unknown");
    expect(res.status).toBe(400);
  });

  test("returns 400 when adapter param is missing", async () => {
    const app = createServer(join(tempRoot, "runs"), { projectDirectory: tempRoot });
    const res = await app.request("/api/projects");
    expect(res.status).toBe(400);
  });
});
