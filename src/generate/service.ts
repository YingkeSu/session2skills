import { renderSummary } from "./render-summary.js";
import { LlmProviderRegistry, OpenAiCompatibleProvider, createPromptRegistry } from "../llm/index.js";
import type { ResolvedLlmProvider } from "../llm/provider.js";
import type { PromptRegistry } from "../llm/prompts/registry.js";
import { allPrompts } from "../llm/prompts/index.js";
import { writeGeneratedArtifacts } from "../persist/generated-artifacts.js";
import type { TonePreset } from "../shared/cli.js";
import { CliUsageError, HYBRID_LLM_ENV_REQUIRED } from "../shared/errors.js";
import { analyzeWithHarness } from "../harness/run-harness.js";
import { buildEvidenceIndex } from "../harness/evidence-index.js";
import { enrichManifestWithEvidence } from "../harness/enrich-evidence.js";
import { loadSessions, buildSessionLoadNotes } from "../sessions/load-sessions.js";
import { EvidenceStore } from "../evidence-store/index.js";
import { getDefaultEvidenceStorePath } from "../evidence-store/paths.js";
import { persistRawEvidence } from "../evidence-store/persist.js";
import { loadTemplateMarkdown, type TemplateName } from "./templates.js";

const HYBRID_LLM_PROVIDER = "openai-compatible";

export type GenerateSkillRunInput = {
  projectDirectory: string;
  outputDirectory: string;
  workspace?: string;
  recent: number;
  force: boolean;
  tone: TonePreset;
  template?: TemplateName;
  llmProvider?: ResolvedLlmProvider;
  promptRegistry?: PromptRegistry;
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

  const resolved = input.llmProvider ?? resolveHybridLlmProvider();
  const registry = input.promptRegistry ?? buildPromptRegistry();

  const templateMarkdown = input.template
    ? await loadTemplateMarkdown(input.template)
    : undefined;

  const harnessResult = await analyzeWithHarness({
    sessions: normalizedSessions,
    evidence: evidenceIndex,
    provider: resolved,
    registry,
    tone: input.tone,
    templateMarkdown,
  });

  const selfContainedManifest = enrichManifestWithEvidence(
    harnessResult.revisedManifest ?? harnessResult.manifest,
    evidenceIndex,
  );

  const confidenceNotes = [
    ...buildSessionLoadNotes(skippedSessions, warnings),
    `harness pipeline: ${(harnessResult.revisedManifest ?? harnessResult.manifest).claims.length} claims extracted across ${(harnessResult.revisedManifest ?? harnessResult.manifest).dimensionsCovered.length} dimensions`,
    `skeptic: ${harnessResult.skepticReport?.issues.length ?? 0} issues found (score: ${harnessResult.skepticReport?.overallScore.toFixed(2) ?? "N/A"})`,
    `verifier: ${harnessResult.verifierReport?.pass ? "PASSED" : harnessResult.verifierReport ? "FAILED" : "SKIPPED"}`,
  ];

  if (harnessResult.error) {
    confidenceNotes.push(`WARNING: ${harnessResult.error}`);
  }

  const summary = renderSummary(
    { ...harnessResult, revisedManifest: selfContainedManifest },
    { tone: input.tone, confidenceNotes },
  );
  const skill = harnessResult.writerOutput?.skillMarkdown ?? "";

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
    verifierPassed: harnessResult.verifierReport?.pass ?? false,
    manifestClaims: (harnessResult.revisedManifest ?? harnessResult.manifest).claims.length,
    skepticIssues: harnessResult.skepticReport?.issues.length ?? 0,
    tone: input.tone,
    force: input.force,
  };
}

export function resolveHybridLlmProvider(): ResolvedLlmProvider {
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

export function buildPromptRegistry(): PromptRegistry {
  const registry = createPromptRegistry();

  for (const prompt of allPrompts) {
    registry.register(prompt);
  }

  return registry;
}
