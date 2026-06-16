import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { encodeCwd } from "./encode.js";

export { encodeCwd } from "./encode.js";

export function getClaudeConfigDir(): string {
  const override = process.env.CLAUDE_CONFIG_DIR?.trim();
  return override || join(homedir(), ".claude");
}

export function getClaudeProjectsDir(): string {
  return join(getClaudeConfigDir(), "projects");
}

export function getProjectSessionsDir(cwd: string): string {
  return join(getClaudeProjectsDir(), encodeCwd(cwd));
}

export function claudeProjectsDirExists(): boolean {
  try {
    return statSync(getClaudeProjectsDir()).isDirectory();
  } catch {
    return false;
  }
}
