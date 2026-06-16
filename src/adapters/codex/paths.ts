import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function getCodexHome(): string {
  const envHome = process.env.CODEX_HOME?.trim();
  if (envHome) {
    return envHome;
  }
  return join(homedir(), ".codex");
}

export function getCodexSqlitePath(): string {
  const sqliteHome = process.env.CODEX_SQLITE_HOME?.trim();
  const root = sqliteHome || getCodexHome();
  return join(root, "state_5.sqlite");
}

export function codexDbExists(): boolean {
  const dbPath = getCodexSqlitePath();
  try {
    return existsSync(dbPath) && statSync(dbPath).isFile();
  } catch {
    return false;
  }
}
