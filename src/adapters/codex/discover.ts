import Database from "better-sqlite3";
import { existsSync } from "node:fs";

import { getCodexSqlitePath } from "./paths.js";
import type { DiscoveredProject } from "../contracts.js";

type ProjectRow = {
  cwd: string;
  session_count: number;
  last_modified: number | null;
};

export type DiscoveredCodexProject = DiscoveredProject & {
  adapter: "codex";
};

export function listCodexProjects(): Array<DiscoveredCodexProject> {
  const dbPath = getCodexSqlitePath();
  if (!existsSync(dbPath)) return [];

  let db: Database.Database;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch {
    return [];
  }

  try {
    const rows = db.prepare(`
      SELECT
        cwd              AS cwd,
        COUNT(*)         AS session_count,
        MAX(updated_at)  AS last_modified
      FROM threads
      WHERE archived = 0
      GROUP BY cwd
    `).all() as Array<ProjectRow>;

    return rows.map((row) => ({
      adapter: "codex" as const,
      projectPath: row.cwd,
      sessionCount: row.session_count,
      lastModified: row.last_modified != null
        ? new Date(row.last_modified * 1000).toISOString()
        : "",
      source: dbPath,
    }));
  } catch {
    return [];
  } finally {
    db.close();
  }
}
