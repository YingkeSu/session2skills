import path from "node:path";

export function resolveProjectDirectory(directory?: string): string {
  return directory ? path.resolve(directory) : process.cwd();
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
