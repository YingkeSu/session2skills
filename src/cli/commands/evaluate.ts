import { Command } from "commander";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { evaluateSkill, type EvaluateSkillInput } from "../../generate/evaluate-skill.js";
import { CliUsageError } from "../../shared/errors.js";
import { validateProjectDirectory, resolveProjectDirectory } from "../../shared/paths.js";

type EvaluateOptions = {
  directory?: string;
  skillDirectory?: string;
  skillFileName?: string;
  verifierReportFileName?: string;
  sizeBudget?: number;
};

export function registerEvaluateCommand(program: Command): void {
  program
    .command("evaluate")
    .description("Evaluate an existing generated skill artifact using deterministic quality gates")
    .option("-d, --directory <path>", "Target project directory containing generated-skills/")
    .option("--skill-directory <path>", "Explicit path to the generated skill directory (overrides --directory)")
    .option("--skill-file-name <name>", "Name of the skill markdown file inside the skill directory", "SKILL.md")
    .option("--verifier-report-file-name <name>", "Name of the verifier report file inside the skill directory", "verifier-report.json")
    .option("--size-budget <bytes>", "Maximum allowed size in bytes for the skill markdown", parseInt, 120_000)
    .action(async (options: EvaluateOptions) => {
      const skillDir = await resolveSkillDirectory(options);
      const evaluation = await evaluateSkill({
        skillDirectory: skillDir,
        skillFileName: options.skillFileName,
        verifierReportFileName: options.verifierReportFileName,
        sizeBudget: options.sizeBudget,
      });

      console.log(JSON.stringify(evaluation.evaluation, null, 2));
    });
}

async function resolveSkillDirectory(options: EvaluateOptions): Promise<string> {
  if (options.skillDirectory) {
    const resolved = path.resolve(options.skillDirectory);
    await validateSkillDirectory(resolved);
    return resolved;
  }

  if (options.directory) {
    const projectDir = validateProjectDirectory(resolveProjectDirectory(options.directory));
    const skillDir = path.join(projectDir, "generated-skills");
    await validateSkillDirectory(skillDir);
    return skillDir;
  }

  const cwd = process.cwd();
  await validateSkillDirectory(cwd);
  return cwd;
}

async function validateSkillDirectory(directory: string): Promise<void> {
  try {
    const stats = await stat(directory);
    if (!stats.isDirectory()) {
      throw new CliUsageError(`Not a directory: ${directory}`);
    }
  } catch (error) {
    if (error instanceof CliUsageError) throw error;
    if ((error as { code?: string }).code === "EACCES") {
      throw new CliUsageError(`Permission denied: ${directory}`);
    }
    if ((error as { code?: string }).code === "ENOENT") {
      throw new CliUsageError(`Directory does not exist: ${directory}`);
    }
    throw new CliUsageError(`Invalid skill directory: ${directory}`);
  }
}


