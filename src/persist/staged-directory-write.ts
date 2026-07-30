import { access, mkdir, mkdtemp, readdir, rename, rm, stat as statFn, writeFile } from "node:fs/promises";
import path from "node:path";

import { CliUsageError } from "../shared/errors.js";

/**
 * Validates that a relative path does not escape the staging directory.
 * Throws an error if the path contains directory traversal attempts.
 */
function validateRelativePath(relativePath: string): void {
  const normalized = path.normalize(relativePath);
  
  if (normalized.startsWith("..")) {
    throw new CliUsageError(`Invalid file path: directory traversal not allowed: ${relativePath}`);
  }
  
  if (path.isAbsolute(relativePath)) {
    throw new CliUsageError(`Invalid file path: absolute paths not allowed: ${relativePath}`);
  }
}

/**
 * Writes a set of files to a directory atomically using a staging directory.
 * Supports nested subpaths (e.g., "subdir/file.json") and maintains overwrite protection.
 * 
 * @param input.outputDirectory - The final output directory path
 * @param input.files - Record mapping relative file paths to their content
 * @param input.force - If true, allows overwriting existing non-empty directories
 * @returns Record mapping input paths to their final absolute paths
 */
export async function writeDirectoryArtifacts(input: {
  outputDirectory: string;
  files: Record<string, string>;
  force: boolean;
}): Promise<Record<string, string>> {
  const parentDirectory = path.dirname(input.outputDirectory);
  const baseName = path.basename(input.outputDirectory);
  await mkdir(parentDirectory, { recursive: true });

  const stagingDirectory = await mkdtemp(path.join(parentDirectory, `.${baseName}.staging-`));

  try {
    for (const [relativePath, content] of Object.entries(input.files)) {
      validateRelativePath(relativePath);
      const targetPath = path.join(stagingDirectory, relativePath);
      const targetDir = path.dirname(targetPath);
      await mkdir(targetDir, { recursive: true });
      await writeFile(targetPath, content, "utf8");
    }

    const finalExists = await pathExists(input.outputDirectory);
    if (finalExists) {
      const stat = await statFn(input.outputDirectory);
      if (!stat.isDirectory()) {
        throw new CliUsageError(`Output path is not a directory: ${input.outputDirectory}`);
      }
      const existingEntries = await readdir(input.outputDirectory);
      // Transient bookkeeping files (e.g. the async-generation `.progress.json`
      // written before the harness commits artifacts) are owned by the runtime,
      // not prior run output, so they must not trip the overwrite guard.
      const significantEntries = existingEntries.filter((entry) => !entry.startsWith("."));
      if (!input.force && significantEntries.length > 0) {
        throw new CliUsageError(`Refusing to overwrite existing output directory without --force: ${input.outputDirectory}`);
      }

      const backupDirectory = path.join(parentDirectory, `.${baseName}.backup-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      await rename(input.outputDirectory, backupDirectory);

      try {
        await rename(stagingDirectory, input.outputDirectory);
      } catch (error) {
        await rename(backupDirectory, input.outputDirectory);
        throw error;
      }

      await rm(backupDirectory, { recursive: true, force: true });
    } else {
      await rename(stagingDirectory, input.outputDirectory);
    }

    return Object.fromEntries(
      Object.keys(input.files).map((fileName) => [fileName, path.join(input.outputDirectory, fileName)]),
    );
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
