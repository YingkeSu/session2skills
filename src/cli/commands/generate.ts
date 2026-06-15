import { Command } from "commander";

import { analyzeRecentSessions } from "../../analyze/run-analysis.js";
import { renderSummary } from "../../generate/render-summary.js";
import { LlmProviderRegistry, OpenAiCompatibleProvider, createPromptRegistry } from "../../llm/index.js";
import { allPrompts } from "../../llm/prompts/index.js";
import type { ProfileV2 } from "../../normalize/models.js";
import { writeHarnessGeneratedArtifacts } from "../../persist/generated-artifacts.js";
import { parsePositiveInteger, parseTonePreset, type TonePreset } from "../../shared/cli.js";
import { CliUsageError, HYBRID_LLM_ENV_REQUIRED } from "../../shared/errors.js";
import { resolveGeneratedSkillsDirectory, resolveProjectDirectory, validateProjectDirectory } from "../../shared/paths.js";
import { analyzeWithHarness } from "../../harness/run-harness.js";
import { buildEvidenceIndex } from "../../analyze/evidence-index.js";
import { buildProfileV2 } from "../../profile/build-profile.js";
import { enrichManifestWithEvidence } from "../../harness/enrich-evidence.js";

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
      const source = await resolveGenerateSource(options, directory);

      if (source.normalizedSessions.length === 0) {
        console.log(`No OpenCode sessions found for ${directory}.`);
        return;
      }

      const summary = renderSummary(source.profile, { tone: options.tone });
      const skill = source.harnessResult.writerOutput.skillMarkdown;

      console.log("--- summary preview ---");
      console.log(summary.split("\n").slice(0, 12).join("\n"));
      console.log("--- skill preview ---");
      console.log(skill.split("\n").slice(0, 18).join("\n"));

      const artifactPaths = await writeHarnessGeneratedArtifacts({
        outputDirectory,
        summary,
        skill,
        claimManifest: source.harnessResult.revisedManifest,
        skepticReport: source.harnessResult.skepticReport,
        verifierReport: source.harnessResult.verifierReport,
        traces: source.harnessResult.traces,
        force: options.force,
      });

      console.log(
        JSON.stringify(
          {
            directory,
            workspace: options.workspace,
            recent: source.normalizedSessions.length,
            outputDirectory,
            mode: "harness",
            artifacts: {
              summaryPath: artifactPaths.summaryPath,
              skillPath: artifactPaths.skillPath,
              claimManifestPath: artifactPaths.claimManifestPath,
              skepticReportPath: artifactPaths.skepticReportPath,
              verifierReportPath: artifactPaths.verifierReportPath,
            },
            verifierPassed: source.harnessResult.verifierReport.pass,
            manifestClaims: source.harnessResult.revisedManifest.claims.length,
            skepticIssues: source.harnessResult.skepticReport.issues.length,
            tone: options.tone,
            force: options.force,
          },
          null,
          2,
        ),
      );
    });
}

type HarnessGenerateSource = {
  profile: ProfileV2;
  normalizedSessions: Awaited<ReturnType<typeof analyzeRecentSessions>>["normalizedSessions"];
  harnessResult: Awaited<ReturnType<typeof analyzeWithHarness>>;
  warnings: Array<string>;
};

async function resolveGenerateSource(options: GenerateOptions, directory: string): Promise<HarnessGenerateSource> {
  const resolved = resolveHybridLlmProvider();
  const registry = buildPromptRegistry();

  const analysis = await analyzeRecentSessions({
    directory,
    workspace: options.workspace,
    recent: options.recent,
    tone: options.tone,
  });

  if (analysis.normalizedSessions.length === 0) {
    return {
      profile: analysis.profile,
      normalizedSessions: [],
      harnessResult: {
        manifest: { schemaVersion: "claim-manifest/v1" as const, claims: [], evidenceSummary: "", dimensionsCovered: [], metadata: { generatedAt: new Date().toISOString(), sessionCount: 0, totalEvidenceItems: 0 } },
        skepticReport: { schemaVersion: "skeptic-report/v1" as const, issues: [], overallScore: 1, metadata: { generatedAt: new Date().toISOString(), claimCount: 0, issueCount: 0 } },
        writerOutput: { skillMarkdown: "# No sessions found\n", sections: [] },
        verifierReport: { schemaVersion: "verifier-report/v1" as const, pass: true, checkedItems: [], issues: [], metadata: { generatedAt: new Date().toISOString(), directiveCount: 0, verifiedCount: 0, fabricatedCount: 0 } },
        revisedManifest: { schemaVersion: "claim-manifest/v1" as const, claims: [], evidenceSummary: "", dimensionsCovered: [], metadata: { generatedAt: new Date().toISOString(), sessionCount: 0, totalEvidenceItems: 0 } },
        traces: [],
      },
      warnings: [],
    };
  }

  const evidenceIndex = buildEvidenceIndex(analysis.normalizedSessions);
  const harnessResult = await analyzeWithHarness({
    sessions: analysis.normalizedSessions,
    evidence: evidenceIndex,
    provider: resolved,
    registry,
    tone: options.tone,
  });

  const profile = buildProfileV2([], {
    confidenceNotes: [
      ...analysis.profile.confidenceNotes,
      `harness pipeline: ${harnessResult.revisedManifest.claims.length} claims extracted across ${harnessResult.revisedManifest.dimensionsCovered.length} dimensions`,
      `skeptic: ${harnessResult.skepticReport.issues.length} issues found (score: ${harnessResult.skepticReport.overallScore.toFixed(2)})`,
      `verifier: ${harnessResult.verifierReport.pass ? "PASSED" : "FAILED"}`,
    ],
  });

  const selfContainedManifest = enrichManifestWithEvidence(
    harnessResult.revisedManifest,
    evidenceIndex,
  );

  return {
    profile,
    normalizedSessions: analysis.normalizedSessions,
    harnessResult: { ...harnessResult, revisedManifest: selfContainedManifest },
    warnings: analysis.warnings.map((w) => w.message),
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
