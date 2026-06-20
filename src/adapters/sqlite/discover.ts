import Database from "better-sqlite3";
import { existsSync } from "node:fs";

import { resolveOpenCodeDBPath } from "./paths.js";
import type { DiscoveredProject } from "../contracts.js";

type ProjectRow = {
  worktree: string;
  session_count: number;
  last_modified: number | null;
};

export type DiscoveredOpenCodeProject = DiscoveredProject & {
  adapter: "sqlite";
};

export function listOpenCodeProjects(): Array<DiscoveredOpenCodeProject> {
  const dbPath = resolveOpenCodeDBPath();
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
        p.worktree      AS worktree,
        COUNT(s.id)     AS session_count,
        MAX(s.time_updated) AS last_modified
      FROM project p
      LEFT JOIN session s ON s.project_id = p.id
      GROUP BY p.id, p.worktree
    `).all() as Array<ProjectRow>;

    return rows.map((row) => ({
      adapter: "sqlite" as const,
      projectPath: row.worktree,
      sessionCount: row.session_count,
      lastModified: row.last_modified != null
        ? new Date(row.last_modified).toISOString()
        : "",
      source: dbPath,
    }));
  } catch {
    return [];
  } finally {
    db.close();
  }
}
