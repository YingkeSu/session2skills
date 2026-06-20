import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listOpenCodeProjects } from "../../../src/adapters/sqlite/discover.js";

const dirs: Array<string> = [];

beforeEach(() => {
  delete process.env.SESSION2SKILLS_DB_PATH;
});

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function makeDb(): { dbPath: string; db: Database.Database } {
  const root = mkdtempSync(join(tmpdir(), "opencode-discover-"));
  dirs.push(root);
  const dbPath = join(root, "opencode.db");
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE project (
      id TEXT PRIMARY KEY,
      worktree TEXT NOT NULL,
      vcs TEXT,
      name TEXT,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      time_initialized INTEGER
    );
    CREATE TABLE session (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      directory TEXT NOT NULL,
      workspace_id TEXT,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
    );
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, data TEXT);
    CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, data TEXT);
  `);
  return { dbPath, db };
}

function insertProject(
  db: Database.Database,
  id: string,
  worktree: string,
  updatedAt: number,
): void {
  db.prepare(
    "INSERT INTO project (id, worktree, name, time_created, time_updated) VALUES (?, ?, ?, ?, ?)",
  ).run(id, worktree, worktree.split("/").pop() ?? worktree, updatedAt, updatedAt);
}

function insertSession(
  db: Database.Database,
  id: string,
  projectId: string,
  directory: string,
  updatedAt: number,
): void {
  db.prepare(
    "INSERT INTO session (id, project_id, directory, time_created, time_updated) VALUES (?, ?, ?, ?, ?)",
  ).run(id, projectId, directory, updatedAt, updatedAt);
}

describe("listOpenCodeProjects", () => {
  it("returns one entry per project with aggregated session count and last modified", () => {
    const { dbPath, db } = makeDb();
    process.env.SESSION2SKILLS_DB_PATH = dbPath;
    insertProject(db, "p1", "/Users/alice/project-a", 1000);
    insertProject(db, "p2", "/Users/alice/project-b", 2000);
    insertSession(db, "s1", "p1", "/Users/alice/project-a", 1500);
    insertSession(db, "s2", "p1", "/Users/alice/project-a", 3000);
    insertSession(db, "s3", "p2", "/Users/alice/project-b", 2500);
    db.close();

    const result = listOpenCodeProjects();
    const byPath = Object.fromEntries(result.map((p) => [p.projectPath, p]));

    expect(result).toHaveLength(2);
    const a = byPath["/Users/alice/project-a"];
    const b = byPath["/Users/alice/project-b"];
    expect(a.sessionCount).toBe(2);
    expect(b.sessionCount).toBe(1);
    expect(a.lastModified).toBe(new Date(3000).toISOString());
    expect(b.lastModified).toBe(new Date(2500).toISOString());
    expect(a.adapter).toBe("sqlite");
  });

  it("returns project with zero sessions via LEFT JOIN", () => {
    const { dbPath, db } = makeDb();
    process.env.SESSION2SKILLS_DB_PATH = dbPath;
    insertProject(db, "p1", "/Users/alice/empty-project", 1000);
    db.close();

    const result = listOpenCodeProjects();

    expect(result).toHaveLength(1);
    expect(result[0].sessionCount).toBe(0);
    expect(result[0].lastModified).toBe("");
  });

  it("returns empty array when DB does not exist", () => {
    process.env.SESSION2SKILLS_DB_PATH = join(tmpdir(), "opencode-nonexistent-" + Date.now());

    const result = listOpenCodeProjects();

    expect(result).toEqual([]);
  });
});
