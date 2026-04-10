import { Command } from "commander";

import { analyzeRecentSessions, analyzeWithLLM } from "../../analyze/run-analysis.js";
import { renderSummary } from "../../generate/render-summary.js";
import { LlmProviderRegistry, OpenAiCompatibleProvider, createPromptRegistry } from "../../llm/index.js";
import { allPrompts } from "../../llm/prompts/index.js";
import { RUN_MANIFEST_SCHEMA_VERSION, type RunArtifact, type RunManifest } from "../../normalize/models.js";
import { writeHybridRunArtifacts, writeRunArtifacts } from "../../persist/run-store.js";
import { parsePositiveInteger, parseTonePreset, type TonePreset } from "../../shared/cli.js";
import { CliUsageError } from "../../shared/errors.js";
import { resolveProjectDirectory, resolveRunsDirectory } from "../../shared/paths.js";

type AnalyzeOptions = {
  directory?: string;
  workspace?: string;
  recent: number;
  out?: string;
  force: boolean;
  tone: TonePreset;
  hybrid: boolean;
};

const HYBRID_LLM_PROVIDER = "openai-compatible";

export function registerAnalyzeCommand(program: Command): void {
  program
    .command("analyze")
    .description("Analyze recent OpenCode sessions and build a preference profile")
    .option("-d, --directory <path>", "Target project directory")
    .option("-w, --workspace <id>", "Optional OpenCode workspace id")
    .option("-r, --recent <number>", "Number of recent sessions to analyze", parsePositiveInteger, 10)
    .option("-o, --out <path>", "Directory for run artifacts and profile output")
    .option("--tone <preset>", "Summary preview tone: concise, balanced, or detailed", parseTonePreset, "balanced")
    .option("--hybrid", "Enable hybrid LLM extraction/merge and write inspectable hybrid run artifacts", false)
    .option("--force", "Allow overwriting existing analyze outputs", false)
    .action(async (options: AnalyzeOptions) => {
      const directory = resolveProjectDirectory(options.directory);
      const outDirectory = resolveRunsDirectory(directory, options.out);
      if (options.hybrid) {
        const resolved = resolveHybridLlmProvider();
        const registry = buildPromptRegistry();
        const analysis = await analyzeWithLLM(
          {
            directory,
            workspace: options.workspace,
            recent: options.recent,
            tone: options.tone,
          },
          { resolved, registry },
          { resolved, registry },
        );
        const { normalizedSessions, profile, warnings } = analysis;

        if (normalizedSessions.length === 0) {
          console.log(`No OpenCode sessions found for ${directory}.`);
          return;
        }

        const artifactPaths = await writeHybridRunArtifacts({
          outputDirectory: outDirectory,
          normalizedSessions,
          profile,
          evidenceIndex: analysis.evidenceIndex,
          ruleClaims: analysis.ruleClaims,
          llmSessionClaims: analysis.llmClaims,
          llmCategoryClaims: analysis.llmCategoryClaims,
          mergedClaims: analysis.mergedClaims,
          skillPlan: analysis.skillPlan,
          llmTraces: collectHybridTraces(analysis),
          manifest: buildHybridManifest({
            directory,
            tone: options.tone,
            normalizedSessions,
            analysis,
          }),
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
              mode: "hybrid",
              artifacts: {
                normalizedPath: artifactPaths.normalizedPath,
                profilePath: artifactPaths.profilePath,
                evidenceIndexPath: artifactPaths.evidenceIndexPath,
                ruleClaimsPath: artifactPaths.ruleClaimsPath,
                llmSessionClaimsPath: artifactPaths.llmSessionClaimsPath,
                llmCategoryClaimsPath: artifactPaths.llmCategoryClaimsPath,
                mergedClaimsPath: artifactPaths.mergedClaimsPath,
                skillPlanPath: artifactPaths.skillPlanPath,
                llmTracesPath: artifactPaths.llmTracesPath,
                manifestPath: artifactPaths.manifestPath,
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
        return;
      }

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

function resolveHybridLlmProvider() {
  const baseUrl = process.env.SESSION2SKILLS_LLM_BASE_URL;
  const model = process.env.SESSION2SKILLS_LLM_MODEL;

  if (!baseUrl || !model) {
    throw new CliUsageError(
      "Hybrid mode requires SESSION2SKILLS_LLM_BASE_URL and SESSION2SKILLS_LLM_MODEL environment variables.",
    );
  }

  const provider = new OpenAiCompatibleProvider({
    provider: process.env.SESSION2SKILLS_LLM_PROVIDER ?? HYBRID_LLM_PROVIDER,
    baseUrl,
    apiKey: process.env.SESSION2SKILLS_LLM_API_KEY,
    defaultModel: {
      model,
      version: process.env.SESSION2SKILLS_LLM_MODEL_VERSION,
    },
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

function collectHybridTraces(analysis: Awaited<ReturnType<typeof analyzeWithLLM>>) {
  return [
    ...analysis.llmTraces,
    ...(analysis.reductionTraces ?? []),
    ...(analysis.skillTrace ? [analysis.skillTrace] : []),
  ];
}

function buildHybridManifest(input: {
  directory: string;
  tone: TonePreset;
  normalizedSessions: Awaited<ReturnType<typeof analyzeRecentSessions>>["normalizedSessions"];
  analysis: Awaited<ReturnType<typeof analyzeWithLLM>>;
}): RunManifest {
  const runID = `run:${Date.now().toString(36)}`;
  const traces = collectHybridTraces(input.analysis);
  const promptVersions = [...new Set(traces.map((trace) => `${trace.stage}:${trace.request.promptName}@${trace.promptSetVersion}`))].sort();
  const llm = input.analysis.llmTraces[0] ?? input.analysis.reductionTraces?.[0] ?? input.analysis.skillTrace;
  const artifacts: Array<RunArtifact> = [
    { kind: "normalized-sessions", fileName: "normalized.json", schemaVersion: "normalized-session/v1" },
    { kind: "profile", fileName: "profile.json", schemaVersion: input.analysis.profile.schemaVersion, promptSetVersion: input.analysis.profile.promptSetVersion },
    { kind: "evidence-index", fileName: "evidence-index.json", schemaVersion: "evidence-item/v1", promptSetVersion: input.analysis.profile.promptSetVersion },
    { kind: "rule-claims", fileName: "rule-claims.json", schemaVersion: "candidate-claim/v1", promptSetVersion: input.analysis.profile.promptSetVersion },
    { kind: "llm-session-claims", fileName: "llm-session-claims.json", schemaVersion: "candidate-claim/v1", promptSetVersion: input.analysis.profile.promptSetVersion },
    { kind: "llm-category-claims", fileName: "llm-category-claims.json", schemaVersion: "candidate-claim/v1", promptSetVersion: input.analysis.profile.promptSetVersion },
    { kind: "merged-claims", fileName: "merged-claims.json", schemaVersion: "merged-claim/v1", promptSetVersion: input.analysis.profile.promptSetVersion },
    { kind: "skill-plan", fileName: "skill-plan.json", schemaVersion: input.analysis.skillPlan.schemaVersion, promptSetVersion: input.analysis.skillPlan.promptSetVersion },
    { kind: "llm-traces", fileName: "llm-traces.json", schemaVersion: "llm-trace/v1", promptSetVersion: input.analysis.profile.promptSetVersion },
  ];

  return {
    schemaVersion: RUN_MANIFEST_SCHEMA_VERSION,
    runID,
    generatedAt: new Date().toISOString(),
    directory: input.directory,
    sessionIDs: input.normalizedSessions.map((session) => session.id),
    promptSetVersion: input.analysis.profile.promptSetVersion,
    artifacts,
    metadata: {
      mode: "hybrid",
      tone: input.tone,
      ...(llm
        ? {
            llm: {
              provider: llm.provider,
              model: llm.model,
            },
          }
        : {}),
      promptVersions: {
        prompts: promptVersions,
      },
      schemaVersions: {
        manifest: RUN_MANIFEST_SCHEMA_VERSION,
        normalized: "normalized-session/v1",
        profile: input.analysis.profile.schemaVersion,
        evidenceIndex: "evidence-item/v1",
        ruleClaims: "candidate-claim/v1",
        llmSessionClaims: "candidate-claim/v1",
        llmCategoryClaims: "candidate-claim/v1",
        mergedClaims: "merged-claim/v1",
        skillPlan: input.analysis.skillPlan.schemaVersion,
        llmTraces: "llm-trace/v1",
      },
      skillRenderMode: input.analysis.skillRenderMode,
    },
  };
}
