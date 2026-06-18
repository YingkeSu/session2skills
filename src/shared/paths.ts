import { statSync } from "node:fs";
import path from "node:path";

import { CliUsageError } from "./errors.js";

export function resolveProjectDirectory(directory?: string): string {
  return directory ? path.resolve(directory) : process.cwd();
}

/**
 * Validate that a directory path exists and is actually a directory.
 * Throws CliUsageError with a clear message for invalid paths.
 */
export function validateProjectDirectory(directory: string): string {
  try {
    const stat = statSync(directory);
    if (!stat.isDirectory()) {
      throw new CliUsageError(`Not a directory: ${directory}`);
    }
  } catch (error) {
    if (error instanceof CliUsageError) throw error;
    if ((error as { code?: string }).code === "EACCES") {
      throw new CliUsageError(`Permission denied: ${directory}`);
    }
    throw new CliUsageError(`Directory does not exist: ${directory}`);
  }
  return directory;
}

export function getDefaultRunsDirectory(rootDirectory: string): string {
  return path.join(rootDirectory, ".session2skills", "runs");
}

export function getDefaultGeneratedSkillsDirectory(rootDirectory: string): string {
  return path.join(rootDirectory, "generated-skills");
}

export function resolveRunsDirectory(rootDirectory: string, outputDirectory?: string): string {
  return outputDirectory ? path.resolve(outputDirectory) : getDefaultRunsDirectory(rootDirectory);
}

export function resolveGeneratedSkillsDirectory(rootDirectory: string, outputDirectory?: string): string {
  return outputDirectory
    ? path.resolve(outputDirectory)
    : getDefaultGeneratedSkillsDirectory(rootDirectory);
}

export function getDefaultSkillStoreRoot(rootDirectory: string): string {
  return path.join(rootDirectory, ".session2skills", "skills");
}

export function getActiveSkillPath(storeRoot: string, skillId: string): string {
  return path.join(storeRoot, "active", skillId);
}

export function isValidRunName(name: string): boolean {
  if (!name || name.length === 0) return false;
  if (name.includes("..")) return false;
  if (name.startsWith("/") || name.startsWith("\\")) return false;
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

export function normalizeRunName(name?: string): string {
  const fallback = timestampedRunName();
  if (!name || name.trim().length === 0) {
    return fallback;
  }

  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : fallback;
}

export function timestampedRunName(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
