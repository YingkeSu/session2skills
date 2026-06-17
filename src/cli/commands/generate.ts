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
import { EvidenceStore } from "../../evidence-store/index.js";
import { getDefaultEvidenceStorePath } from "../../evidence-store/paths.js";
import { persistRawEvidence } from "../../evidence-store/persist.js";

type GenerateOptions = {
  directory?: string;
  workspace?: string;
  recent: number;
  output?: string;
  force: boolean;
  tone: TonePreset;
};

const HYBRID_LLM_PROVIDER = "openai-compatible";

export type GenerateSkillRunInput = {
  projectDirectory: string;
  outputDirectory: string;
  workspace?: string;
  recent: number;
  force: boolean;
  tone: TonePreset;
};

export type GenerateSkillRunResult = {
  directory: string;
  workspace?: string;
  recent: number;
  outputDirectory: string;
  mode: "harness";
  artifacts: {
    summaryPath: string;
    skillPath: string;
    claimManifestPath: string;
    skepticReportPath: string;
    verifierReportPath: string;
  };
  verifierPassed: boolean;
  manifestClaims: number;
  skepticIssues: number;
  tone: TonePreset;
  force: boolean;
};

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

export async function generateSkillRun(
  input: GenerateSkillRunInput,
): Promise<GenerateSkillRunResult | null> {
  const { normalizedSessions, warnings, skippedSessions } = await loadSessions({
    directory: input.projectDirectory,
    workspace: input.workspace,
    recent: input.recent,
  });

  if (normalizedSessions.length === 0) {
    return null;
  }

  const evidenceIndex = buildEvidenceIndex(normalizedSessions);

  const evidenceStore = new EvidenceStore(getDefaultEvidenceStorePath(input.projectDirectory));
  try {
    persistRawEvidence(normalizedSessions, evidenceStore);
  } finally {
    evidenceStore.close();
  }

  const resolved = resolveHybridLlmProvider();
  const registry = buildPromptRegistry();

  const harnessResult = await analyzeWithHarness({
    sessions: normalizedSessions,
    evidence: evidenceIndex,
    provider: resolved,
    registry,
    tone: input.tone,
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

  const summary = renderSummary(
    { ...harnessResult, revisedManifest: selfContainedManifest },
    { tone: input.tone, confidenceNotes },
  );
  const skill = harnessResult.writerOutput.skillMarkdown;

  const artifactPaths = await writeGeneratedArtifacts({
    outputDirectory: input.outputDirectory,
    summary,
    skill,
    claimManifest: selfContainedManifest,
    skepticReport: harnessResult.skepticReport,
    verifierReport: harnessResult.verifierReport,
    traces: harnessResult.traces,
    force: input.force,
  });

  return {
    directory: input.projectDirectory,
    workspace: input.workspace,
    recent: normalizedSessions.length,
    outputDirectory: input.outputDirectory,
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
    tone: input.tone,
    force: input.force,
  };
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
