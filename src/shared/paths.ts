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
