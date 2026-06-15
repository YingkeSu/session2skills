import { createSessionProvider } from "../adapters/registry.js";
import { normalizeSession } from "../normalize/normalize-session.js";
import type {
  CandidateClaim,
  EvidenceItem,
  LLMTrace,
  NormalizedSession,
  ProfileV2,
  SkillIntent,
  SkillPlan,
  WorkflowSignalKind,
} from "../normalize/models.js";
import type { RawSessionDiff } from "../normalize/raw-session.js";
import {
  buildMergedRuleClaims,
  buildProfileV2,
  extractAllRuleClaims,
} from "../profile/build-profile.js";
import { buildEvidenceIndex } from "./evidence-index.js";
import { filterSessions } from "./session-tree.js";
import {
  mergeClaims,
  type MergedClaimResult,
} from "./claim-merge.js";
import {
  extractAllSessionClaims,
  type BatchExtractionResult,
  type ExtractionBudget,
  DEFAULT_EXTRACTION_BUDGET,
} from "./llm-extractors.js";
import {
  reduceAllCategories,
  DEFAULT_REDUCE_BUDGET,
} from "./llm-reducers.js";
import type { CategoryReduceResult, ReduceBudget } from "./llm-reducers.js";
import { getDefaultLlmCache } from "../llm/cache.js";
import type { ResolvedLlmProvider } from "../llm/provider.js";
import type { PromptRegistry } from "../llm/prompts/registry.js";
import { buildSkillPlan } from "../generate/skill-plan.js";
import { renderSkillArtifact } from "../generate/render-skill.js";
import type { TonePreset } from "../shared/cli.js";

export type AnalysisWarning = {
  type:
    | "diff-unavailable"
    | "llm-extraction-error"
    | "llm-reduction-error"
    | "skill-composition-error";
  sessionID?: string;
  dimension?: WorkflowSignalKind;
  message: string;
};

export type AnalysisOptions = {
  directory: string;
  workspace?: string;
  recent: number;
  messageLimit?: number;
  tone?: TonePreset;
};

export type LlmExtractionOptions = {
  resolved: ResolvedLlmProvider;
  budget?: Partial<ExtractionBudget>;
  registry?: PromptRegistry;
  cache?: ReturnType<typeof getDefaultLlmCache>;
};

export type LlmReductionOptions = {
  resolved: ResolvedLlmProvider;
  budget?: Partial<ReduceBudget>;
  registry?: PromptRegistry;
  cache?: ReturnType<typeof getDefaultLlmCache>;
};

export async function analyzeRecentSessions(options: AnalysisOptions): Promise<{
  normalizedSessions: Array<NormalizedSession>;
  profile: ProfileV2;
  warnings: Array<AnalysisWarning>;
  evidenceIndex?: Array<EvidenceItem>;
  llmClaims?: Array<CandidateClaim>;
  llmTraces?: Array<LLMTrace>;
}> {
  const providerOpts = { directory: options.directory, workspace: options.workspace };
  const { provider, close } = await createSessionProvider(providerOpts);

  try {
    const listedSessions = await provider.listRecentSessions(providerOpts, options.recent);
    const filteredSessions = filterSessions(listedSessions);

    const normalizedSessions = [] as Array<NormalizedSession>;
    const warnings = [] as Array<AnalysisWarning>;

    for (const listedSession of filteredSessions) {
      const session = await provider.getSession(providerOpts, listedSession.id);
      const messages = await provider.getSessionMessages(providerOpts, listedSession.id, options.messageLimit ?? 50);
      let diff: Array<RawSessionDiff> = [];
      try {
        diff = await provider.getSessionDiff(providerOpts, listedSession.id);
      } catch (error) {
        warnings.push({
          type: "diff-unavailable",
          sessionID: listedSession.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }

      normalizedSessions.push(
        normalizeSession({
          session,
          messages,
          diff,
        }),
      );
    }

    const skippedSessions = listedSessions.length - filteredSessions.length;
    const mergedClaims = buildMergedRuleClaims(normalizedSessions);
    const profile = buildProfileV2(mergedClaims, {
      confidenceNotes: buildAnalysisConfidenceNotes(skippedSessions, warnings),
    });

    return {
      normalizedSessions,
      profile,
      warnings,
    };
  } finally {
    await close();
  }
}

export async function analyzeWithLLM(
  options: AnalysisOptions,
  llmOptions: LlmExtractionOptions,
  reductionOptions?: LlmReductionOptions,
): Promise<{
  normalizedSessions: Array<NormalizedSession>;
  profile: ProfileV2;
  warnings: Array<AnalysisWarning>;
  evidenceIndex: Array<EvidenceItem>;
  ruleClaims: Array<CandidateClaim>;
  llmClaims: Array<CandidateClaim>;
  llmCategoryClaims: Array<CandidateClaim>;
  llmTraces: Array<LLMTrace>;
  rejectedClaims: BatchExtractionResult["rejectedClaims"];
  extractionErrors: BatchExtractionResult["errors"];
  mergedClaims: MergedClaimResult;
  skillPlan: SkillPlan;
  reducedClaims?: Record<WorkflowSignalKind, CategoryReduceResult>;
  reductionTraces?: Array<LLMTrace>;
  skill: string;
  skillTrace?: LLMTrace;
  skillRenderMode: "llm" | "fallback";
  skillIntent?: SkillIntent;
}> {
  const base = await analyzeRecentSessions(options);

  const evidenceIndex = buildEvidenceIndex(base.normalizedSessions);
  const ruleClaims = extractAllRuleClaims(base.normalizedSessions);

  const budget: ExtractionBudget = {
    tokenBudget: llmOptions.budget?.tokenBudget ?? DEFAULT_EXTRACTION_BUDGET.tokenBudget,
    maxOutputTokens: llmOptions.budget?.maxOutputTokens ?? DEFAULT_EXTRACTION_BUDGET.maxOutputTokens,
    timeoutMs: llmOptions.budget?.timeoutMs ?? DEFAULT_EXTRACTION_BUDGET.timeoutMs,
    temperature: llmOptions.budget?.temperature ?? DEFAULT_EXTRACTION_BUDGET.temperature,
  };

  const llmCache = llmOptions.cache ?? getDefaultLlmCache();

  const extraction = await extractAllSessionClaims(
    base.normalizedSessions,
    evidenceIndex,
    budget,
    llmOptions.resolved,
    llmOptions.registry,
    llmCache,
  );

  for (const err of extraction.errors) {
    base.warnings.push({
      type: "llm-extraction-error",
      sessionID: err.sessionID,
      message: err.error,
    });
  }

  let reducedClaims: Record<WorkflowSignalKind, CategoryReduceResult> | undefined;
  let reductionTraces: Array<LLMTrace> | undefined;
  let llmCategoryClaims: Array<CandidateClaim> = [];

  if (reductionOptions) {
    const reduceBudget: ReduceBudget = {
      tokenBudget: reductionOptions.budget?.tokenBudget ?? DEFAULT_REDUCE_BUDGET.tokenBudget,
      timeoutMs: reductionOptions.budget?.timeoutMs ?? DEFAULT_REDUCE_BUDGET.timeoutMs,
      temperature: reductionOptions.budget?.temperature ?? DEFAULT_REDUCE_BUDGET.temperature,
    };

    const reduction = await reduceAllCategories(
      extraction.claims,
      evidenceIndex,
      reduceBudget,
      reductionOptions.resolved.provider,
      reductionOptions.resolved.model,
      reductionOptions.registry,
      reductionOptions.cache ?? llmCache,
    );

    reducedClaims = reduction.results;
    reductionTraces = reduction.traces;
    for (const warning of reduction.warnings) {
      base.warnings.push({
        type: "llm-reduction-error",
        dimension: warning.dimension,
        message: warning.error,
      });
    }
    llmCategoryClaims = Object.values(reduction.results)
      .flatMap((result) => result.claims)
      .sort((left, right) => left.claimID.localeCompare(right.claimID));
  }

  const mergedClaims = mergeClaims(
    ruleClaims,
    [...extraction.claims, ...llmCategoryClaims],
    evidenceIndex,
  );
  const profile = buildProfileV2([...mergedClaims.accepted, ...mergedClaims.tentative], {
    confidenceNotes: base.profile.confidenceNotes,
  });

  const skillPlan = buildSkillPlan(mergedClaims.accepted, mergedClaims.tentative);
  const renderedSkill = await renderSkillArtifact(profile, options.tone ?? "balanced", {
    skillPlan,
    llmClient: llmOptions.resolved,
    acceptedClaims: mergedClaims.accepted,
    tentativeClaims: mergedClaims.tentative,
  });

  if (renderedSkill.renderer === "fallback" && renderedSkill.reason) {
    base.warnings.push({
      type: "skill-composition-error",
      message: renderedSkill.reason,
    });
  }

  return {
    normalizedSessions: base.normalizedSessions,
    profile,
    warnings: base.warnings,
    evidenceIndex,
    ruleClaims,
    llmClaims: extraction.claims,
    llmCategoryClaims,
    llmTraces: extraction.traces,
    rejectedClaims: extraction.rejectedClaims,
    extractionErrors: extraction.errors,
    mergedClaims,
    skillPlan,
    reducedClaims,
    reductionTraces,
    skill: renderedSkill.markdown,
    skillTrace: renderedSkill.trace,
    skillRenderMode: renderedSkill.renderer,
    skillIntent: renderedSkill.skillIntent,
  };
}

export async function reduceSessionClaims(
  claims: Array<CandidateClaim>,
  evidence: Array<EvidenceItem>,
  reductionOptions: LlmReductionOptions,
): Promise<{
  reducedClaims: Record<WorkflowSignalKind, CategoryReduceResult>;
  reductionTraces: Array<LLMTrace>;
}> {
  const reduceBudget: ReduceBudget = {
    tokenBudget: reductionOptions.budget?.tokenBudget ?? DEFAULT_REDUCE_BUDGET.tokenBudget,
    timeoutMs: reductionOptions.budget?.timeoutMs ?? DEFAULT_REDUCE_BUDGET.timeoutMs,
    temperature: reductionOptions.budget?.temperature ?? DEFAULT_REDUCE_BUDGET.temperature,
  };

  const reduction = await reduceAllCategories(
    claims,
    evidence,
    reduceBudget,
    reductionOptions.resolved.provider,
    reductionOptions.resolved.model,
    reductionOptions.registry,
  );

  return {
    reducedClaims: reduction.results,
    reductionTraces: reduction.traces,
  };
}

function buildAnalysisConfidenceNotes(
  skippedSessions: number,
  warnings: Array<AnalysisWarning>,
): Array<string> {
  const notes: Array<string> = [];

  if (skippedSessions > 0) {
    notes.push(`session filtering: skipped ${skippedSessions} likely internal subagent/review session(s)`);
  }

  if (warnings.length > 0) {
    notes.push(`analysis warnings: ${warnings.length} session diff request(s) failed and were omitted from analysis`);
  }

  return notes;
}
