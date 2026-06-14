import { Command } from "commander";

import { analyzeRecentSessions } from "../../analyze/run-analysis.js";
import { renderSummary } from "../../generate/render-summary.js";
import { writeRunArtifacts } from "../../persist/run-store.js";
import { parsePositiveInteger, parseTonePreset, type TonePreset } from "../../shared/cli.js";
import { resolveProjectDirectory, resolveRunsDirectory, validateProjectDirectory } from "../../shared/paths.js";

type AnalyzeOptions = {
  directory?: string;
  workspace?: string;
  recent: number;
  out?: string;
  force: boolean;
  tone: TonePreset;
};

export function registerAnalyzeCommand(program: Command): void {
  program
    .command("analyze")
    .description("Analyze recent OpenCode sessions and build a preference profile")
    .option("-d, --directory <path>", "Target project directory")
    .option("-w, --workspace <id>", "Optional OpenCode workspace id")
    .option("-r, --recent <number>", "Number of recent sessions to analyze", parsePositiveInteger, 10)
    .option("-o, --out <path>", "Directory for run artifacts and profile output")
    .option("--tone <preset>", "Summary preview tone: concise, balanced, or detailed", parseTonePreset, "balanced")
    .option("--force", "Allow overwriting existing analyze outputs", false)
    .action(async (options: AnalyzeOptions) => {
      const directory = validateProjectDirectory(resolveProjectDirectory(options.directory));
      const outDirectory = resolveRunsDirectory(directory, options.out);

      const analysis = await analyzeRecentSessions({
        directory,
        workspace: options.workspace,
        recent: options.recent,
        tone: options.tone,
      });
      const { normalizedSessions, profile, warnings } = analysis;

      if (normalizedSessions.length === 0) {
        console.log(`No OpenCode sessions found for ${directory}.`);
        return;
      }

      const artifactPaths = await writeRunArtifacts({
        outputDirectory: outDirectory,
        normalizedSessions,
        profile,
        force: options.force,
      });

      const preview = renderSummary(profile, { tone: options.tone });
      console.log("--- analyze preview ---");
      console.log(preview.split("\n").slice(0, options.tone === "detailed" ? 18 : 12).join("\n"));

      console.log(
        JSON.stringify(
          {
            directory,
            workspace: options.workspace,
            recent: normalizedSessions.length,
            outDirectory,
            mode: "legacy",
            artifacts: {
              normalizedPath: artifactPaths.normalizedPath,
              profilePath: artifactPaths.profilePath,
            },
            warnings,
            force: options.force,
            tone: options.tone,
            strongestSignals: {
              workStyle: profile.workStyle[0]?.value ?? null,
              communicationStyle: profile.communicationStyle[0]?.value ?? null,
              validationHabit: profile.validationHabits[0]?.value ?? null,
              constraint: profile.constraints[0]?.value ?? null,
            },
          },
          null,
          2,
        ),
      );
    });
}
