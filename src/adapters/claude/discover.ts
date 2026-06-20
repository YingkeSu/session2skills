// Reverse-discovery: scan Claude's projects dir and infer each project's
// real cwd from the transcripts (paths.ts only does forward lookup).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { getClaudeConfigDir, getClaudeProjectsDir } from "./paths.js";
import type { DiscoveredProject } from "../contracts.js";

const JSONL_EXT = ".jsonl";
const MAX_CWD_SCAN_LINES = 50;

export type DiscoveredClaudeProject = DiscoveredProject & {
  adapter: "claude";
  encodedDir: string;
  configDir: string;
};

export function listClaudeProjects(): Array<DiscoveredClaudeProject> {
  const configDir = getClaudeConfigDir();
  const projectsDir = getClaudeProjectsDir();
  if (!existsSync(projectsDir)) return [];

  let entries: Array<string>;
  try {
    entries = readdirSync(projectsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }

  return entries.map((encodedDir) => describeProject(configDir, encodedDir));
}

function describeProject(
  configDir: string,
  encodedDir: string,
): DiscoveredClaudeProject {
  const projectDir = join(projectsRoot(configDir), encodedDir);
  const jsonlFiles = listJsonlFiles(projectDir);
  const sessionCount = jsonlFiles.length;
  const lastModified = computeLastModified(jsonlFiles);
  const projectPath = inferProjectPath(projectDir, jsonlFiles, encodedDir);

  return {
    adapter: "claude",
    encodedDir,
    projectPath,
    sessionCount,
    lastModified,
    configDir,
    source: configDir,
  };
}

function projectsRoot(configDir: string): string {
  return join(configDir, "projects");
}

function listJsonlFiles(projectDir: string): Array<string> {
  let names: Array<string>;
  try {
    names = readdirSync(projectDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(JSONL_EXT))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
  return names.map((name) => join(projectDir, name));
}

function computeLastModified(files: Array<string>): string {
  if (files.length === 0) return "";
  let maxMs = 0;
  for (const file of files) {
    try {
      const ms = statSync(file).mtimeMs;
      if (ms > maxMs) maxMs = ms;
    } catch {}
  }
  return maxMs > 0 ? new Date(maxMs).toISOString() : "";
}

function inferProjectPath(
  _projectDir: string,
  files: Array<string>,
  encodedDir: string,
): string {
  if (files.length === 0) return encodedDir;
  try {
    const raw = readFileSync(files[0]!, "utf8");
    const lines = raw.split("\n", MAX_CWD_SCAN_LINES);
    for (const line of lines) {
      if (!line.includes("cwd")) continue;
      const parsed = JSON.parse(line) as { cwd?: unknown };
      if (typeof parsed.cwd === "string" && parsed.cwd.length > 0) {
        return parsed.cwd;
      }
    }
  } catch {}
  return encodedDir;
}
