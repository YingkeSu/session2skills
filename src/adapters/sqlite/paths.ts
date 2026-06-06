import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

function xdgDataHome(): string {
  return process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
}

export function resolveOpenCodeDBPath(): string {
  const envPath = process.env.SESSION2SKILLS_DB_PATH;
  if (envPath) {
    return resolve(envPath);
  }

  return join(xdgDataHome(), "opencode", "opencode.db");
}

export function resolveSnapshotDir(): string {
  const envPath = process.env.SESSION2SKILLS_SNAPSHOT_DIR;
  if (envPath) {
    return resolve(envPath);
  }

  return join(xdgDataHome(), "opencode", "snapshot");
}

export function openCodeDBExists(): boolean {
  return existsSync(resolveOpenCodeDBPath());
}
