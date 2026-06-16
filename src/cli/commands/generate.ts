import { Command } from "commander";
import { renderSummary } from "../../generate/render-summary.js";
import { LlmProviderRegistry, OpenAiCompatibleProvider, createPromptRegistry } from "../../llm/index.js";
import { allPrompts } from "../../llm/prompts/index.js";
import { writeGeneratedArtifacts } from "../../persist/generated-artifacts.js";
import { parsePositiveInteger, parseTonePreset, type TonePreset } from "../../shared/cli.js";
import { CliUsageError, HYBRID_LLM_ENV_REQUIRED } from "../../shared/errors.js";
import { resolveGeneratedSkillsDirectory, resolveProjectDirectory, validateProjectDirectory } from "../../shared/paths.js";
import { analyzeWithHarness } from "../../harness/run-harness.js";
import { buildEvidenceIndex } from "../../harness/evidence-index.js";
import { enrichManifestWithEvidence } from "../../harness/enrich-evidence.js";
import { loadSessions, buildSessionLoadNotes } from "../../sessions/load-sessions.js";

type GenerateOptions = {
  directory?: string;
  workspace?: string;
  recent: number;
  output?: string;
  force: boolean;
  tone: TonePreset;
};

const HYBRID_LLM_PROVIDER = "openai-compatible";

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

      const { normalizedSessions, warnings, skippedSessions } = await loadSessions({
        directory,
        workspace: options.workspace,
        recent: options.recent,
      });

      if (normalizedSessions.length === 0) {
        console.log(`No OpenCode sessions found for ${directory}.`);
        return;
      }

      const evidenceIndex = buildEvidenceIndex(normalizedSessions);
      const resolved = resolveHybridLlmProvider();
      const registry = buildPromptRegistry();

      const harnessResult = await analyzeWithHarness({
        sessions: normalizedSessions,
        evidence: evidenceIndex,
        provider: resolved,
        registry,
        tone: options.tone,
      });

      const selfContainedManifest = enrichManifestWithEvidence(
        harnessResult.revisedManifest,
        evidenceIndex,
      );

      const confidenceNotes = [
        ...buildSessionLoadNotes(skippedSessions, warnings),
        `harness pipeline: ${harnessResult.revisedManifest.claims.length} claims extracted across ${harnessResult.revisedManifest.dimensionsCovered.length} dimensions`,
        `skeptic: ${harnessResult.skepticReport.issues.length} issues found (score: ${harnessResult.skepticReport.overallScore.toFixed(2)})`,
        `verifier: ${harnessResult.verifierReport.pass ? "PASSED" : "FAILED"}`,
      ];

      const summary = renderSummary({ confidenceNotes }, { tone: options.tone });
      const skill = harnessResult.writerOutput.skillMarkdown;

      console.log("--- summary preview ---");
      console.log(summary.split("\n").slice(0, 12).join("\n"));
      console.log("--- skill preview ---");
      console.log(skill.split("\n").slice(0, 18).join("\n"));

      const artifactPaths = await writeGeneratedArtifacts({
        outputDirectory,
        summary,
        skill,
        claimManifest: selfContainedManifest,
        skepticReport: harnessResult.skepticReport,
        verifierReport: harnessResult.verifierReport,
        traces: harnessResult.traces,
        force: options.force,
      });

      console.log(
        JSON.stringify(
          {
            directory,
            workspace: options.workspace,
            recent: normalizedSessions.length,
            outputDirectory,
            mode: "harness",
            artifacts: {
              summaryPath: artifactPaths.summaryPath,
              skillPath: artifactPaths.skillPath,
              claimManifestPath: artifactPaths.claimManifestPath,
              skepticReportPath: artifactPaths.skepticReportPath,
              verifierReportPath: artifactPaths.verifierReportPath,
            },
            verifierPassed: harnessResult.verifierReport.pass,
            manifestClaims: harnessResult.revisedManifest.claims.length,
            skepticIssues: harnessResult.skepticReport.issues.length,
            tone: options.tone,
            force: options.force,
          },
          null,
          2,
        ),
      );
    });
}

function resolveHybridLlmProvider() {
  const baseUrl = process.env.SESSION2SKILLS_LLM_BASE_URL;
  const model = process.env.SESSION2SKILLS_LLM_MODEL;

  if (!baseUrl || !model) {
    throw new CliUsageError(
      HYBRID_LLM_ENV_REQUIRED,
    );
  }

  const providerName = process.env.SESSION2SKILLS_LLM_PROVIDER ?? HYBRID_LLM_PROVIDER;
  const preferJsonObject = providerName === "deepseek" || providerName === "zhipuai";

  const provider = new OpenAiCompatibleProvider({
    provider: providerName,
    baseUrl,
    apiKey: process.env.SESSION2SKILLS_LLM_API_KEY,
    defaultModel: {
      model,
      version: process.env.SESSION2SKILLS_LLM_MODEL_VERSION,
    },
    preferJsonObject,
  });

  return new LlmProviderRegistry([{ provider }]).resolve(provider.provider);
}

function buildPromptRegistry() {
  const registry = createPromptRegistry();

  for (const prompt of allPrompts) {
    registry.register(prompt);
  }

  return registry;
}
