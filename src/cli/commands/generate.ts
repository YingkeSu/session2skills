import { Command } from "commander";
import { parsePositiveInteger, parseTonePreset, type TonePreset } from "../../shared/cli.js";
import { resolveGeneratedSkillsDirectory, resolveProjectDirectory, validateProjectDirectory } from "../../shared/paths.js";
import { generateSkillRun } from "../../generate/service.js";

type GenerateOptions = {
  directory?: string;
  workspace?: string;
  recent: number;
  output?: string;
  force: boolean;
  tone: TonePreset;
};

export type { GenerateSkillRunInput, GenerateSkillRunResult } from "../../generate/service.js";

export function registerGenerateCommand(program: Command): void {
  program
    .command("generate")
    .description("Generate summary and SKILL markdown artifacts from OpenCode sessions via the harness pipeline")
    .option("-d, --directory <path>", "Target project directory")
    .option("-w, --workspace <id>", "Optional OpenCode workspace id")
    .option("-r, --recent <number>", "Number of recent sessions to analyze", parsePositiveInteger, 10)
    .option("-o, --output <path>", "Directory where generated skill artifacts should be written")
    .option("--tone <preset>", "Output tone: concise, balanced, or detailed", parseTonePreset, "balanced")
    .option("--force", "Allow overwriting existing generated outputs", false)
    .action(async (options: GenerateOptions) => {
      const directory = validateProjectDirectory(resolveProjectDirectory(options.directory));
      const outputDirectory = resolveGeneratedSkillsDirectory(directory, options.output);

      const result = await generateSkillRun({
        projectDirectory: directory,
        outputDirectory,
        workspace: options.workspace,
        recent: options.recent,
        force: options.force,
        tone: options.tone,
      });

      if (result === null) {
        console.log(`No OpenCode sessions found for ${directory}.`);
        return;
      }

      console.log(JSON.stringify(result, null, 2));
    });
}
