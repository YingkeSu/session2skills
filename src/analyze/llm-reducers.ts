import { buildCategoryReducePacket } from "../llm/packets.js";
import type { CategoryReducePacket } from "../llm/packets.js";
import type { LLMCache } from "../llm/cache.js";
import type { LlmProvider } from "../llm/provider.js";
import { generateTraceID } from "../llm/trace.js";
import type { LLMTrace as InternalLLMTrace } from "../llm/trace.js";
import type {
  CandidateClaim,
  CandidateClaimSchemaVersion,
  EvidenceCitation,
  EvidenceItem,
  LLMFinishReason,
  LLMTrace,
  LLMTraceStage,
  LLMTraceWarning,
  PromptSetVersion,
  WorkflowSignalKind,
  WorkflowSignalLabelMap,
} from "../normalize/models.js";
import type { PromptRegistry } from "../llm/prompts/registry.js";
import { LlmProviderError, toErrorMessage } from "../shared/errors.js";
import { buildEvidenceIDSet, buildEvidenceLookup } from "./evidence-index.js";
import { CANDIDATE_CLAIM_SCHEMA_VERSION } from "./helpers.js";
import { classifyLlmFailure, getCauseMessage, normalizeFinishReason, toPromptSetVersion } from "./llm-common.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReduceBudget = {
  tokenBudget: number;
  timeoutMs: number;
  temperature?: number;
};

export type CategoryReduceResult<K extends WorkflowSignalKind = WorkflowSignalKind> = {
  claims: Array<CandidateClaim<K>>;
  conflicts: Array<ConflictNote>;
  weakEvidenceAreas: Array<WeakEvidenceNote>;
  trace: LLMTrace;
  fallback: boolean;
  warning?: string;
  cacheHit?: boolean;
};

export type ConflictNote = {
  description: string;
  sideA: Array<string>;
  sideB: Array<string>;
  severity: number;
};

export type WeakEvidenceNote = {
  description: string;
  dimension: WorkflowSignalKind;
  evidenceCount: number;
  suggestedMinimum: number;
};

type RawReduceOutput = {
  claims: Array<RawReduceClaim>;
  conflicts?: Array<RawReduceConflict>;
  weakEvidenceAreas?: Array<RawReduceWeakEvidence>;
};

type RawReduceClaim = {
  dimension: string;
  label: string;
  confidence: number;
  rationale: string;
  supportingEvidenceIDs: Array<string>;
  counterEvidenceIDs?: Array<string>;
};

type RawReduceConflict = {
  description: string;
  sideA: Array<string>;
  sideB: Array<string>;
  severity: number;
};

type RawReduceWeakEvidence = {
  description: string;
  dimension: string;
  evidenceCount: number;
  suggestedMinimum: number;
};

// ---------------------------------------------------------------------------
// Default budget
// ---------------------------------------------------------------------------

export const DEFAULT_REDUCE_BUDGET: ReduceBudget = {
  tokenBudget: 8000,
  timeoutMs: 30_000,
  temperature: 0.2,
};

// ---------------------------------------------------------------------------
// Main reducer function
// ---------------------------------------------------------------------------

export async function reduceCategoryClaimsViaLLM<K extends WorkflowSignalKind>(
  claims: Array<CandidateClaim<K>>,
  dimension: K,
  evidence: ReadonlyArray<EvidenceItem>,
  budget: ReduceBudget,
  llmProvider: LlmProvider,
  model?: Parameters<typeof llmProvider.generateStructured>[0]["model"],
  registry?: PromptRegistry,
  cache?: LLMCache,
): Promise<CategoryReduceResult<K>> {
  const validEvidenceIDs = buildEvidenceIDSet(evidence);
  const evidenceLookup = buildEvidenceLookup(evidence);
  const dimClaims = claims.filter((c) => c.dimension === dimension);

  const packet = buildCategoryReducePacket(
    [...evidence],
    dimension,
    budget.tokenBudget,
      dimClaims as Array<CandidateClaim>,
      registry,
  );
  const promptSetVersion = toPromptSetVersion(packet.promptVersion);
  const resolvedModel = model ?? llmProvider.defaultModel ?? { model: "default" };
  const cacheKey = buildCacheKey(cache, packet, llmProvider.provider, resolvedModel, dimension);

  if (cache && cacheKey) {
    const cached = cache.get(cacheKey);
    if (cached) {
      const trace = materializeCachedTrace(cached.traces[0], cacheKey, cached.timestamp, dimension);
      return {
        claims: structuredClone(cached.claims) as Array<CandidateClaim<K>>,
        conflicts: [],
        weakEvidenceAreas: [],
        trace,
        fallback: false,
        cacheHit: true,
      };
    }
  }

  const startedAt = Date.now();
  const traceID = generateTraceID();

  try {
    const schema = buildReduceOutputSchema(packet);

    const result = await llmProvider.generateStructured<RawReduceOutput>({
      model: resolvedModel,
      messages: [
        { role: "system", content: packet.systemPrompt },
        { role: "user", content: packet.userPayload },
      ],
      temperature: budget.temperature ?? DEFAULT_REDUCE_BUDGET.temperature,
      maxOutputTokens: 4096,
      options: {
        timeoutMs: budget.timeoutMs,
      },
      schema,
    });

    const latencyMs = Date.now() - startedAt;

    const validated = validateReduceOutput(
      result.object,
      dimension,
      validEvidenceIDs,
      evidenceLookup,
      packet,
      traceID,
      promptSetVersion,
    );

    const internalTrace: InternalLLMTrace = {
      traceID,
      timestamp: new Date().toISOString(),
      promptID: packet.promptID,
      promptVersion: packet.promptVersion,
      provider: result.metadata.provider,
      model: result.metadata.model,
      version: result.metadata.version,
      inputArtifactRef: `category:${dimension}`,
      latencyMs,
      usage: result.metadata.usage,
      parsedOutput: {
        kind: "candidate-claims",
        claims: validated.claims,
      },
      rawOutput: result.rawText,
    };

    const trace = convertTraceToModel(internalTrace, dimension, packet, {
      provider: result.metadata.provider,
      model: result.metadata.model,
      version: result.metadata.version,
      latencyMs,
      attempts: result.metadata.attempts,
      finishReason: normalizeFinishReason(result.finishReason),
      cache: cacheKey ? { hit: false, key: cacheKey } : undefined,
    });

    if (cache && cacheKey) {
      cache.set(cacheKey, {
        claims: structuredClone(validated.claims),
        traces: [structuredClone(trace)],
        timestamp: trace.timestamp,
      });
    }

    return {
      claims: validated.claims as Array<CandidateClaim<K>>,
      conflicts: validated.conflicts,
      weakEvidenceAreas: validated.weakEvidenceAreas,
      trace,
      fallback: false,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const classified = classifyLlmFailure(error);
    const fallbackClaims = dimClaims.map((claim) => ({
      ...claim,
      claimID: `claim:category-reduce:fallback:${dimension}:${claim.claimID}`,
      confidence: Math.min(claim.confidence * 0.7, 0.5),
      rationale: `[FALLBACK: LLM reduce failed — ${classified.message}] Original: ${claim.rationale}`,
      source: {
        type: "llm-category" as const,
        traceID,
        promptSetVersion,
        dimension,
      },
    }));

    const internalTrace: InternalLLMTrace = {
      traceID,
      timestamp: new Date().toISOString(),
      promptID: packet.promptID,
      promptVersion: packet.promptVersion,
      provider: llmProvider.provider,
      model: resolvedModel.model,
      version: resolvedModel.version,
      inputArtifactRef: `category:${dimension}`,
      latencyMs,
      parsedOutput: {
        kind: "candidate-claims",
        claims: fallbackClaims,
      },
    };

    const trace = convertTraceToModel(internalTrace, dimension, packet, {
      provider: llmProvider.provider,
      model: resolvedModel.model,
      version: resolvedModel.version,
      latencyMs,
      attempts: 1,
      finishReason: "error",
      warnings: [classified.warning],
    });

    return {
      claims: fallbackClaims,
      conflicts: [],
      weakEvidenceAreas: [
        {
          description: `LLM reduction failed for dimension "${dimension}"`,
          dimension,
          evidenceCount: dimClaims.length,
          suggestedMinimum: 3,
        },
      ],
      trace,
      fallback: true,
      warning: classified.message,
    };
  }
}

// ---------------------------------------------------------------------------
// Batch reducer for all 4 dimensions
// ---------------------------------------------------------------------------

export async function reduceAllCategories(
  claims: Array<CandidateClaim>,
  evidence: ReadonlyArray<EvidenceItem>,
  budget: ReduceBudget,
  llmProvider: LlmProvider,
  model?: Parameters<typeof llmProvider.generateStructured>[0]["model"],
  registry?: PromptRegistry,
  cache?: LLMCache,
): Promise<{
  results: Record<WorkflowSignalKind, CategoryReduceResult>;
  traces: Array<LLMTrace>;
  warnings: Array<{ dimension: WorkflowSignalKind; error: string }>;
}> {
  const dimensions: Array<WorkflowSignalKind> = [
    "communication-style",
    "constraint",
    "validation-habit",
    "work-style",
  ];

  const results = {} as Record<WorkflowSignalKind, CategoryReduceResult>;
  const traces: Array<LLMTrace> = [];
  const warnings: Array<{ dimension: WorkflowSignalKind; error: string }> = [];

  for (const dim of dimensions) {
    const typedClaims = claims.filter((c) => c.dimension === dim);
    const result = await reduceCategoryClaimsViaLLM(
      typedClaims as Array<CandidateClaim<typeof dim>>,
      dim,
      evidence,
      budget,
      llmProvider,
      model,
      registry,
      cache,
    );
    results[dim] = result;
    traces.push(result.trace);
    if (result.warning) {
      warnings.push({ dimension: dim, error: result.warning });
    }
  }

  return { results, traces, warnings };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateReduceOutput(
  raw: RawReduceOutput,
  expectedDimension: WorkflowSignalKind,
  validEvidenceIDs: Set<string>,
  evidenceLookup: Map<string, EvidenceItem>,
  packet: CategoryReducePacket,
  traceID: string,
  promptSetVersion: PromptSetVersion,
): {
  claims: Array<CandidateClaim>;
  conflicts: Array<ConflictNote>;
  weakEvidenceAreas: Array<WeakEvidenceNote>;
} {
  const validClaims: Array<CandidateClaim> = [];
  const includedIDs = new Set(packet.includedEvidenceIDs);

  for (const rawClaim of raw.claims ?? []) {
    const dim = coerceDimension(rawClaim.dimension);
    if (dim !== expectedDimension) continue;

    const supportingIDs = (rawClaim.supportingEvidenceIDs ?? []).filter(
      (id) => validEvidenceIDs.has(id),
    );
    const counterIDs = (rawClaim.counterEvidenceIDs ?? []).filter((id) =>
      validEvidenceIDs.has(id),
    );

    if (supportingIDs.length === 0) continue;

    // Build citations from actual evidence items (not fabricated)
    const citations: Array<EvidenceCitation> = supportingIDs
      .map((id) => evidenceLookup.get(id))
      .filter((item): item is EvidenceItem => item !== undefined)
      .map((item) => item.citation);

    if (counterIDs.length > 0) {
      const counterCitations: Array<EvidenceCitation> = counterIDs
        .map((id) => evidenceLookup.get(id))
        .filter((item): item is EvidenceItem => item !== undefined)
        .map((item) => item.citation);
      citations.push(...counterCitations);
    }

    const claimCounter = validClaims.length + 1;

    validClaims.push({
      schemaVersion: CANDIDATE_CLAIM_SCHEMA_VERSION,
      claimID: `claim:category-reduce:${expectedDimension}:${claimCounter}`,
      dimension: expectedDimension,
      label: rawClaim.label as WorkflowSignalLabelMap[typeof expectedDimension],
      confidence: clamp01(rawClaim.confidence),
      rationale: rawClaim.rationale,
      citations,
      source: {
        type: "llm-category",
        traceID,
        promptSetVersion,
        dimension: expectedDimension,
      },
    });
  }

  const conflicts: Array<ConflictNote> = (raw.conflicts ?? [])
    .filter((c) => c.description && c.sideA.length > 0 && c.sideB.length > 0)
    .map((c) => ({
      description: c.description,
      sideA: c.sideA.filter((id) => includedIDs.has(id)),
      sideB: c.sideB.filter((id) => includedIDs.has(id)),
      severity: clamp01(c.severity),
    }));

  const weakEvidenceAreas: Array<WeakEvidenceNote> = (
    raw.weakEvidenceAreas ?? []
  )
    .filter((w) => w.description)
    .map((w) => ({
      description: w.description,
      dimension: coerceDimension(w.dimension) ?? expectedDimension,
      evidenceCount: w.evidenceCount ?? 0,
      suggestedMinimum: w.suggestedMinimum ?? 3,
    }));

  return { claims: validClaims, conflicts, weakEvidenceAreas };
}

function coerceDimension(
  value: string,
): WorkflowSignalKind | null {
  const valid: Array<WorkflowSignalKind> = [
    "work-style",
    "communication-style",
    "validation-habit",
    "constraint",
  ];
  if (valid.includes(value as WorkflowSignalKind)) {
    return value as WorkflowSignalKind;
  }
  return null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

// ---------------------------------------------------------------------------
// Trace conversion
// ---------------------------------------------------------------------------

function convertTraceToModel(
  internal: InternalLLMTrace,
  _dimension: WorkflowSignalKind,
  packet: CategoryReducePacket,
  metadata: {
    provider: string;
    model: string;
    version?: string;
    latencyMs: number;
    attempts: number;
    finishReason?: LLMFinishReason;
    cache?: LLMTrace["cache"];
    warnings?: Array<LLMTraceWarning>;
  },
): LLMTrace {
  return {
    schemaVersion: "llm-trace/v1",
    traceID: internal.traceID,
    timestamp: internal.timestamp,
    promptSetVersion: toPromptSetVersion(packet.promptVersion),
    stage: "category-claims" as LLMTraceStage,
    provider: metadata.provider,
    model: metadata.model,
    inputArtifactRef: internal.inputArtifactRef,
    cache: metadata.cache,
    warnings: metadata.warnings,
    request: {
      promptName: packet.promptID,
      messages: [
        { role: "system", content: packet.systemPrompt },
        { role: "user", content: `[payload: ${packet.metadata.tokenEstimate} tokens, ${packet.metadata.evidenceCount} evidence items]` },
      ],
    },
    response: {
      finishReason: metadata.finishReason ?? "unknown",
      rawText: typeof internal.rawOutput === "string" ? internal.rawOutput : "",
      structuredOutput: {
        kind: "candidate-claims",
        claims: (internal.parsedOutput as { claims?: Array<CandidateClaim> }).claims ?? [],
      },
    },
    usage: internal.usage,
  };
}

function buildCacheKey(
  cache: LLMCache | undefined,
  packet: CategoryReducePacket,
  provider: string,
  model: { model: string; version?: string },
  dimension: WorkflowSignalKind,
): string | undefined {
  if (!cache) {
    return undefined;
  }

  const normalizedInputHash = cache.hash({
    inputArtifactRef: `category:${dimension}`,
    promptID: packet.promptID,
    systemPrompt: packet.systemPrompt,
    userPayload: packet.userPayload,
    includedEvidenceIDs: packet.includedEvidenceIDs,
    dimension,
  });

  return cache.hash({
    evidenceIndexHash: normalizedInputHash,
    promptVersion: packet.promptVersion,
    model: {
      provider,
      ...model,
    },
  });
}

function materializeCachedTrace(
  trace: LLMTrace | undefined,
  cacheKey: string,
  cachedAt: string,
  dimension: WorkflowSignalKind,
): LLMTrace {
  const cachedTrace = structuredClone(trace ?? buildEmptyCachedTrace(dimension));
  cachedTrace.timestamp = new Date().toISOString();
  cachedTrace.cache = {
    hit: true,
    key: cacheKey,
    storedAt: cachedAt,
  };
  return cachedTrace;
}

function buildEmptyCachedTrace(dimension: WorkflowSignalKind): LLMTrace {
  return {
    schemaVersion: "llm-trace/v1",
    traceID: generateTraceID(),
    timestamp: new Date().toISOString(),
    promptSetVersion: "prompt-set/0.0.0" as PromptSetVersion,
    stage: "category-claims",
    provider: "cache",
    model: "cache",
    inputArtifactRef: `category:${dimension}`,
    request: {
      promptName: "cache-miss",
      messages: [],
    },
    response: {
      finishReason: "unknown",
      rawText: "",
      structuredOutput: {
        kind: "candidate-claims",
        claims: [],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Structured generation schema
// ---------------------------------------------------------------------------

function buildReduceOutputSchema(
  _packet: CategoryReducePacket,
): {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  parse: (value: unknown) => RawReduceOutput;
} {
  return {
    name: "category_reduce_output",
    description:
      "Synthesized claims for a single taxonomy dimension with conflicts and weak evidence areas.",
    schema: {
      type: "object",
      properties: {
        claims: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dimension: { type: "string" },
              label: { type: "string" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              rationale: { type: "string" },
              supportingEvidenceIDs: {
                type: "array",
                items: { type: "string" },
              },
              counterEvidenceIDs: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: [
              "dimension",
              "label",
              "confidence",
              "rationale",
              "supportingEvidenceIDs",
            ],
          },
        },
        conflicts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              sideA: { type: "array", items: { type: "string" } },
              sideB: { type: "array", items: { type: "string" } },
              severity: { type: "number", minimum: 0, maximum: 1 },
            },
            required: ["description", "sideA", "sideB", "severity"],
          },
        },
        weakEvidenceAreas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              dimension: { type: "string" },
              evidenceCount: { type: "number" },
              suggestedMinimum: { type: "number" },
            },
            required: ["description", "dimension"],
          },
        },
      },
      required: ["claims"],
    },
    parse: (value: unknown): RawReduceOutput => {
      if (!value || typeof value !== "object") {
        return { claims: [] };
      }
      const obj = value as Record<string, unknown>;
      return {
        claims: Array.isArray(obj.claims) ? obj.claims : [],
        conflicts: Array.isArray(obj.conflicts) ? obj.conflicts : undefined,
        weakEvidenceAreas: Array.isArray(obj.weakEvidenceAreas)
          ? obj.weakEvidenceAreas
          : undefined,
      };
    },
  };
}
