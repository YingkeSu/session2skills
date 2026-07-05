import { renderSummary } from "./render-summary.js";
import { createPromptRegistry } from "../llm/index.js";
import type { ResolvedLlmProvider } from "../llm/provider.js";
import { resolveLlmProvider, type LlmRunConfig } from "../llm/selection.js";
import type { PromptRegistry } from "../llm/prompts/registry.js";
import { allPrompts } from "../llm/prompts/index.js";
import { writeGeneratedArtifacts } from "../persist/generated-artifacts.js";
import type { TonePreset } from "../shared/cli.js";
import { analyzeWithHarness } from "../harness/run-harness.js";
import { buildEvidenceIndex } from "../harness/evidence-index.js";
import { enrichManifestWithEvidence } from "../harness/enrich-evidence.js";
import { loadSessions, buildSessionLoadNotes } from "../sessions/load-sessions.js";
import { loadSpecificSessions, type SessionSelection } from "../sessions/load-specific-sessions.js";
import { EvidenceStore } from "../evidence-store/index.js";
import { getDefaultEvidenceStorePath } from "../evidence-store/paths.js";
import { persistRawEvidence } from "../evidence-store/persist.js";
import { loadTemplateMarkdown, type TemplateName } from "./templates.js";
import { SKILL_TYPE_DIMENSIONS, SKILL_TYPE_FOCUS, type SkillType } from "./skill-types.js";
import type { EvidenceConfig } from "../harness/packets.js";
import type { HarnessStageName } from "../harness/run-harness.js";

export type GenerateSkillRunInput = {
  projectDirectory: string;
  outputDirectory: string;
  workspace?: string;
  recent: number;
  force: boolean;
  tone: TonePreset;
  template?: TemplateName;
  skillType?: SkillType;
  llmProvider?: ResolvedLlmProvider;
  /**
   * Per-run LLM selection that overrides the `SESSION2SKILLS_LLM_*` env vars.
   * Only consulted when {@link llmProvider} is not supplied.
   */
  llmConfig?: LlmRunConfig;
  promptRegistry?: PromptRegistry;
  evidenceConfig?: EvidenceConfig;
  sessionSelections?: Array<SessionSelection>;
  onStageComplete?: (stage: HarnessStageName) => void;
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
  let normalizedSessions;
  let warnings;
  let skippedSessions = 0;

  if (input.sessionSelections && input.sessionSelections.length > 0) {
    const result = await loadSpecificSessions(input.sessionSelections, {
      directory: input.projectDirectory,
      workspace: input.workspace,
    });
    normalizedSessions = result.normalizedSessions;
    warnings = result.warnings;
  } else {
    const result = await loadSessions({
      directory: input.projectDirectory,
      workspace: input.workspace,
      recent: input.recent,
    });
    normalizedSessions = result.normalizedSessions;
    warnings = result.warnings;
    skippedSessions = result.skippedSessions;
  }

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

  const resolved = input.llmProvider ?? resolveLlmProvider(input.llmConfig);
  const registry = input.promptRegistry ?? buildPromptRegistry();

  const templateMarkdown = input.template
    ? await loadTemplateMarkdown(input.template)
    : undefined;

  const selectedDimensions = input.skillType
    ? [...SKILL_TYPE_DIMENSIONS[input.skillType]]
    : undefined;
  const skillTypeFocus = input.skillType
    ? SKILL_TYPE_FOCUS[input.skillType]
    : undefined;

  const harnessResult = await analyzeWithHarness({
    sessions: normalizedSessions,
    evidence: evidenceIndex,
    provider: resolved,
    registry,
    tone: input.tone,
    templateMarkdown,
    selectedDimensions,
    skillTypeFocus,
    evidenceConfig: input.evidenceConfig,
    onStageComplete: input.onStageComplete,
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

/**
 * Resolve the LLM provider from env / per-run config.
 *
 * Resolution lives in {@link resolveLlmProvider} (`src/llm/selection.ts`); this
 * thin wrapper is kept for backwards compatibility with callers that imported
 * the historical "hybrid" name.
 */
export function resolveHybridLlmProvider(config?: LlmRunConfig): ResolvedLlmProvider {
  return resolveLlmProvider(config);
}

export type { EvidenceConfig } from "../harness/packets.js";

export function buildPromptRegistry(): PromptRegistry {
  const registry = createPromptRegistry();

  for (const prompt of allPrompts) {
    registry.register(prompt);
  }

  return registry;
}
