import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listCodexProjects } from "../../../src/adapters/codex/discover.js";

const dirs: Array<string> = [];

beforeEach(() => {
  delete process.env.CODEX_HOME;
  delete process.env.CODEX_SQLITE_HOME;
});

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function makeDb(): { dbPath: string; db: Database.Database } {
  const root = mkdtempSync(join(tmpdir(), "codex-discover-"));
  dirs.push(root);
  const dbPath = join(root, "state_5.sqlite");
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE threads (
      id TEXT PRIMARY KEY,
      rollout_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      cwd TEXT NOT NULL,
      title TEXT,
      archived INTEGER NOT NULL DEFAULT 0
    );
  `);
  return { dbPath, db };
}

function insertThread(
  db: Database.Database,
  id: string,
  cwd: string,
  updatedAt: number,
  archived = 0,
): void {
  db.prepare(
    "INSERT INTO threads (id, rollout_path, created_at, updated_at, cwd, archived) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, `/tmp/rollout-${id}.jsonl`, updatedAt, updatedAt, cwd, archived);
}

describe("listCodexProjects", () => {
  it("aggregates non-archived threads by cwd with count and max updated_at", () => {
    const { dbPath, db } = makeDb();
    process.env.CODEX_SQLITE_HOME = join(dbPath, "..");
    insertThread(db, "t1", "/Users/alice/project-a", 1700000000);
    insertThread(db, "t2", "/Users/alice/project-a", 1700000500);
    insertThread(db, "t3", "/Users/alice/project-b", 1700000300);
    db.close();

    const result = listCodexProjects();
    const byPath = Object.fromEntries(result.map((p) => [p.projectPath, p]));

    expect(result).toHaveLength(2);
    const a = byPath["/Users/alice/project-a"];
    const b = byPath["/Users/alice/project-b"];
    expect(a.sessionCount).toBe(2);
    expect(b.sessionCount).toBe(1);
    expect(a.lastModified).toBe(new Date(1700000500 * 1000).toISOString());
    expect(b.lastModified).toBe(new Date(1700000300 * 1000).toISOString());
    expect(a.adapter).toBe("codex");
  });

  it("excludes archived threads from count", () => {
    const { dbPath, db } = makeDb();
    process.env.CODEX_SQLITE_HOME = join(dbPath, "..");
    insertThread(db, "t1", "/Users/alice/proj", 1700000000, 0);
    insertThread(db, "t2", "/Users/alice/proj", 1700000500, 1);
    db.close();

    const result = listCodexProjects();

    expect(result).toHaveLength(1);
    expect(result[0].sessionCount).toBe(1);
  });

  it("returns empty array when DB does not exist", () => {
    process.env.CODEX_SQLITE_HOME = join(tmpdir(), "codex-nonexistent-" + Date.now());

    const result = listCodexProjects();

    expect(result).toEqual([]);
  });
});
