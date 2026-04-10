/**
 * LLM-based session claim extractor.
 *
 * For each session packet, asks the LLM for structured candidate claims
 * with `evidenceIDs` and optional `counterEvidenceIDs`. Parses and validates
 * structured output. Rejects malformed or uncited claims deterministically.
 *
 * Produces per-session LLM claims and trace artifacts.
 */

import type {
  CandidateClaim,
  CandidateClaimSchemaVersion,
  CandidateClaimSource,
  EvidenceCitation,
  EvidenceItem,
  LLMFinishReason,
  LLMTrace,
  LLMTraceWarning,
  NormalizedSession,
  PromptSetVersion,
  WorkflowSignalKind,
  WorkflowSignalLabelMap,
} from "../normalize/models.js";
import type { LLMCache } from "../llm/cache.js";
import type { LlmMessage, LlmStructuredGenerationResult } from "../llm/index.js";
import type { ResolvedLlmProvider } from "../llm/provider.js";
import type { SessionMapPacket } from "../llm/packets.js";
import { buildSessionMapPacket } from "../llm/packets.js";
import type { PromptRegistry } from "../llm/prompts/registry.js";
import { generateTraceID } from "../llm/trace.js";
import type { LLMTrace as InternalLLMTrace } from "../llm/trace.js";
import { LlmProviderError, toErrorMessage } from "../shared/errors.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const CANDIDATE_CLAIM_SCHEMA_VERSION: CandidateClaimSchemaVersion = "candidate-claim/v1";

/**
 * Raw claim as returned by the LLM before validation.
 */
type RawLLMClaim = {
  dimension: string;
  label: string;
  confidence: number;
  rationale: string;
  evidenceIDs: Array<string>;
  counterEvidenceIDs?: Array<string>;
};

type RawLLMOutput = {
  claims: Array<RawLLMClaim>;
};

/**
 * Result of extracting claims from a single session via LLM.
 */
export type SessionExtractionResult = {
  claims: Array<CandidateClaim>;
  trace: LLMTrace;
  /** Claims rejected during validation (for debugging/audit). */
  rejectedClaims: Array<{ raw: RawLLMClaim; reason: string }>;
  error?: string;
  cacheHit?: boolean;
};

export type ExtractionBudget = {
  /** Max tokens for the prompt packet. */
  tokenBudget: number;
  /** Max tokens the LLM may generate. */
  maxOutputTokens?: number;
  /** Request timeout passed through to the provider. */
  timeoutMs?: number;
  /** Temperature for generation. */
  temperature?: number;
};

export const DEFAULT_EXTRACTION_BUDGET: ExtractionBudget = {
  tokenBudget: 8000,
  maxOutputTokens: 2048,
  timeoutMs: 30_000,
  temperature: 0.1,
};

// ---------------------------------------------------------------------------
// Valid dimension set
// ---------------------------------------------------------------------------

const VALID_DIMENSIONS = new Set<WorkflowSignalKind>([
  "work-style",
  "communication-style",
  "validation-habit",
  "constraint",
]);

// ---------------------------------------------------------------------------
// Claim ID generation
// ---------------------------------------------------------------------------

let sessionClaimCounter = 0;

function nextSessionClaimID(sessionID: string): string {
  sessionClaimCounter += 1;
  return `claim:llm-session:${sessionID}:${sessionClaimCounter}`;
}

/** Reset claim counter (useful for deterministic tests). */
export function resetSessionClaimCounter(): void {
  sessionClaimCounter = 0;
}

// ---------------------------------------------------------------------------
// Evidence ID validation
// ---------------------------------------------------------------------------

/**
 * Build a lookup set of valid evidence IDs from the evidence index.
 */
function buildEvidenceIDSet(evidence: ReadonlyArray<EvidenceItem>): Set<string> {
  const ids = new Set<string>();
  for (const item of evidence) {
    ids.add(item.evidenceID);
  }
  return ids;
}

/**
 * Build a lookup map from evidenceID → EvidenceItem for citation construction.
 */
function buildEvidenceLookup(evidence: ReadonlyArray<EvidenceItem>): Map<string, EvidenceItem> {
  const map = new Map<string, EvidenceItem>();
  for (const item of evidence) {
    map.set(item.evidenceID, item);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Raw LLM claim validation
// ---------------------------------------------------------------------------

function validateRawClaim(
  raw: RawLLMClaim,
  validEvidenceIDs: Set<string>,
): { valid: true; claim: RawLLMClaim } | { valid: false; reason: string } {
  if (!raw.dimension || typeof raw.dimension !== "string") {
    return { valid: false, reason: "missing or invalid 'dimension'" };
  }
  if (!raw.label || typeof raw.label !== "string") {
    return { valid: false, reason: "missing or invalid 'label'" };
  }
  if (!raw.rationale || typeof raw.rationale !== "string") {
    return { valid: false, reason: "missing or invalid 'rationale'" };
  }

  if (!VALID_DIMENSIONS.has(raw.dimension as WorkflowSignalKind)) {
    return {
      valid: false,
      reason: `invalid dimension '${raw.dimension}'. Must be one of: ${[...VALID_DIMENSIONS].join(", ")}`,
    };
  }

  if (typeof raw.confidence !== "number" || raw.confidence < 0 || raw.confidence > 1) {
    return { valid: false, reason: `invalid confidence '${raw.confidence}'. Must be 0-1.` };
  }

  if (!Array.isArray(raw.evidenceIDs) || raw.evidenceIDs.length === 0) {
    return { valid: false, reason: "evidenceIDs must be a non-empty array" };
  }

  for (const id of raw.evidenceIDs) {
    if (typeof id !== "string" || !validEvidenceIDs.has(id)) {
      return { valid: false, reason: `invalid evidenceID reference '${String(id)}'` };
    }
  }

  if (raw.counterEvidenceIDs !== undefined) {
    if (!Array.isArray(raw.counterEvidenceIDs)) {
      return { valid: false, reason: "counterEvidenceIDs must be an array if present" };
    }
    for (const id of raw.counterEvidenceIDs) {
      if (typeof id !== "string" || !validEvidenceIDs.has(id)) {
        return { valid: false, reason: `invalid counterEvidenceID reference '${String(id)}'` };
      }
    }
  }

  return { valid: true, claim: raw };
}

// ---------------------------------------------------------------------------
// Build CandidateClaim from validated raw claim
// ---------------------------------------------------------------------------

function buildCandidateClaim(
  raw: RawLLMClaim,
  sessionID: string,
  evidenceLookup: Map<string, EvidenceItem>,
  traceID: string,
  promptSetVersion: PromptSetVersion,
): CandidateClaim {
  const dimension = raw.dimension as WorkflowSignalKind;
  const label = raw.label as WorkflowSignalLabelMap[typeof dimension];

  const citations: Array<EvidenceCitation> = raw.evidenceIDs
    .map((id) => evidenceLookup.get(id))
    .filter((item): item is EvidenceItem => item !== undefined)
    .map((item) => item.citation);

  if (raw.counterEvidenceIDs && raw.counterEvidenceIDs.length > 0) {
    const counterCitations: Array<EvidenceCitation> = raw.counterEvidenceIDs
      .map((id) => evidenceLookup.get(id))
      .filter((item): item is EvidenceItem => item !== undefined)
      .map((item) => item.citation);
    citations.push(...counterCitations);
  }

  const source: CandidateClaimSource = {
    type: "llm-session",
    traceID,
    promptSetVersion,
    sessionID,
  };

  return {
    schemaVersion: CANDIDATE_CLAIM_SCHEMA_VERSION,
    claimID: nextSessionClaimID(sessionID),
    dimension,
    label,
    confidence: raw.confidence,
    rationale: raw.rationale,
    citations,
    source,
  };
}

// ---------------------------------------------------------------------------
// PromptSetVersion derivation
// ---------------------------------------------------------------------------

function toPromptSetVersion(packetVersion: string): PromptSetVersion {
  // Packet versions are bare semver like "1.0.0" or "0.0.0"
  // PromptSetVersion expects "prompt-set/..." format
  if (packetVersion.startsWith("prompt-set/")) {
    return packetVersion as PromptSetVersion;
  }
  return `prompt-set/${packetVersion}` as PromptSetVersion;
}

// ---------------------------------------------------------------------------
// Structured output schema for LLM call
// ---------------------------------------------------------------------------

const SESSION_CLAIMS_OUTPUT_SCHEMA = {
  name: "session_claims",
  description: "Candidate claims extracted from a coding session",
  schema: {
    type: "object",
    properties: {
      claims: {
        type: "array",
        items: {
          type: "object",
          properties: {
            dimension: {
              type: "string",
              enum: ["work-style", "communication-style", "validation-habit", "constraint"],
            },
            label: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            rationale: { type: "string" },
            evidenceIDs: { type: "array", items: { type: "string" } },
            counterEvidenceIDs: { type: "array", items: { type: "string" } },
          },
          required: ["dimension", "label", "confidence", "rationale", "evidenceIDs"],
        },
      },
    },
    required: ["claims"],
  },
  parse: (value: unknown): RawLLMOutput => {
    if (!value || typeof value !== "object") {
      throw new Error("LLM output must be a JSON object");
    }
    const obj = value as Record<string, unknown>;
    if (!Array.isArray(obj.claims)) {
      throw new Error("LLM output must contain a 'claims' array");
    }
    return { claims: obj.claims as Array<RawLLMClaim> };
  },
};

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

/**
 * Extract candidate claims from a single session using LLM.
 *
 * 1. Build a session map packet (token-bounded prompt)
 * 2. Call LLM with structured output generation
 * 3. Validate returned claims against schema and evidence IDs
 * 4. Create trace artifact
 *
 * @param session   - The normalized session to extract claims from
 * @param evidence  - All evidence items (will be filtered to session-relevant subset)
 * @param budget    - Token budget and generation parameters
 * @param resolved  - Resolved LLM provider + model
 * @param registry  - Optional prompt registry for template lookup
 * @returns Extraction result with validated claims, trace, and rejected claims
 */
export async function extractSessionClaimsViaLLM(
  session: NormalizedSession,
  evidence: ReadonlyArray<EvidenceItem>,
  budget: ExtractionBudget,
  resolved: ResolvedLlmProvider,
  registry?: PromptRegistry,
  cache?: LLMCache,
): Promise<SessionExtractionResult> {
  const packet = buildSessionMapPacket(session, evidence, budget.tokenBudget, registry);

  const includedEvidenceIDs = new Set(packet.includedEvidenceIDs);
  const includedEvidence = evidence.filter((e) => includedEvidenceIDs.has(e.evidenceID));
  const evidenceLookup = buildEvidenceLookup(includedEvidence);
  const validEvidenceIDs = buildEvidenceIDSet(includedEvidence);
  const promptSetVersion = toPromptSetVersion(packet.promptVersion);
  const cacheKey = buildCacheKey(cache, packet, resolved, {
    sessionID: session.id,
  });

  if (cache && cacheKey) {
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        claims: structuredClone(cached.claims),
        trace: materializeCachedTrace(cached.traces[0], cacheKey, cached.timestamp),
        rejectedClaims: [],
        cacheHit: true,
      };
    }
  }

  const traceID = generateTraceID();

  const messages: Array<LlmMessage> = [
    { role: "system", content: packet.systemPrompt },
    { role: "user", content: packet.userPayload },
  ];

  let rawResult: LlmStructuredGenerationResult<RawLLMOutput>;
  let latencyMs: number;
  let usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined;

  try {
    rawResult = await resolved.provider.generateStructured<RawLLMOutput>({
      model: resolved.model,
      messages,
      temperature: budget.temperature ?? DEFAULT_EXTRACTION_BUDGET.temperature,
      maxOutputTokens: budget.maxOutputTokens ?? DEFAULT_EXTRACTION_BUDGET.maxOutputTokens,
      options: {
        timeoutMs: budget.timeoutMs ?? DEFAULT_EXTRACTION_BUDGET.timeoutMs,
      },
      schema: SESSION_CLAIMS_OUTPUT_SCHEMA,
    });

    latencyMs = rawResult.metadata.latencyMs;
    usage = rawResult.metadata.usage;
  } catch (error) {
    const classified = classifyLlmFailure(error);
    const trace = createErrorTrace(packet, resolved, traceID, classified.message);

    return {
      claims: [],
      trace: convertTraceToModel(trace, promptSetVersion, "session-claims", packet, {
        finishReason: "error",
        warnings: [classified.warning],
      }),
      rejectedClaims: [],
      error: classified.message,
    };
  }

  const validatedClaims: Array<CandidateClaim> = [];
  const rejectedClaims: Array<{ raw: RawLLMClaim; reason: string }> = [];

  for (const rawClaim of rawResult.object.claims) {
    const validation = validateRawClaim(rawClaim, validEvidenceIDs);
    if (validation.valid) {
      validatedClaims.push(
        buildCandidateClaim(
          validation.claim,
          session.id,
          evidenceLookup,
          traceID,
          promptSetVersion,
        ),
      );
    } else {
      rejectedClaims.push({ raw: rawClaim, reason: validation.reason });
    }
  }

  const trace = convertTraceToModel(
    {
      traceID,
      timestamp: new Date().toISOString(),
      promptID: packet.promptID,
      promptVersion: packet.promptVersion,
      provider: rawResult.metadata.provider,
      model: rawResult.metadata.model,
      version: rawResult.metadata.version,
      inputArtifactRef: `session:${session.id}`,
      latencyMs,
      usage,
      parsedOutput: { claims: validatedClaims },
      rawOutput: rawResult.rawText,
    },
    promptSetVersion,
    "session-claims",
    packet,
    {
      cache: cacheKey ? { hit: false, key: cacheKey } : undefined,
      finishReason: normalizeFinishReason(rawResult.finishReason),
    },
  );

  if (cache && cacheKey) {
    cache.set(cacheKey, {
      claims: structuredClone(validatedClaims),
      traces: [structuredClone(trace)],
      timestamp: trace.timestamp,
    });
  }

  return { claims: validatedClaims, trace, rejectedClaims };
}

// ---------------------------------------------------------------------------
// Batch extraction
// ---------------------------------------------------------------------------

export type BatchExtractionResult = {
  claims: Array<CandidateClaim>;
  traces: Array<LLMTrace>;
  rejectedClaims: Array<{ sessionID: string; raw: RawLLMClaim; reason: string }>;
  errors: Array<{ sessionID: string; error: string }>;
};

/**
 * Extract claims from multiple sessions via LLM.
 * Processes sessions sequentially to respect rate limits.
 */
export async function extractAllSessionClaims(
  sessions: Array<NormalizedSession>,
  evidence: ReadonlyArray<EvidenceItem>,
  budget: ExtractionBudget,
  resolved: ResolvedLlmProvider,
  registry?: PromptRegistry,
  cache?: LLMCache,
): Promise<BatchExtractionResult> {
  const allClaims: Array<CandidateClaim> = [];
  const allTraces: Array<LLMTrace> = [];
  const allRejected: Array<{ sessionID: string; raw: RawLLMClaim; reason: string }> = [];
  const allErrors: Array<{ sessionID: string; error: string }> = [];

  const sorted = [...sessions].sort((a, b) => a.id.localeCompare(b.id));

  for (const session of sorted) {
    const sessionEvidence = evidence.filter(
      (e) => e.citation.sessionID === session.id,
    );

    try {
      const result = await extractSessionClaimsViaLLM(
        session,
        sessionEvidence,
        budget,
        resolved,
        registry,
        cache,
      );

      allClaims.push(...result.claims);
      allTraces.push(result.trace);

      if (result.error) {
        allErrors.push({ sessionID: session.id, error: result.error });
      }

      for (const rejected of result.rejectedClaims) {
        allRejected.push({ sessionID: session.id, ...rejected });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      allErrors.push({ sessionID: session.id, error: errorMsg });
    }
  }

  return {
    claims: allClaims,
    traces: allTraces,
    rejectedClaims: allRejected,
    errors: allErrors,
  };
}

// ---------------------------------------------------------------------------
// Trace conversion helpers
// ---------------------------------------------------------------------------

function createErrorTrace(
  packet: SessionMapPacket,
  resolved: ResolvedLlmProvider,
  traceID: string,
  errorMessage: string,
): InternalLLMTrace {
  return {
    traceID,
    timestamp: new Date().toISOString(),
    promptID: packet.promptID,
    promptVersion: packet.promptVersion,
    provider: resolved.provider.provider,
    model: resolved.model.model,
    version: resolved.model.version,
    inputArtifactRef: `session:${packet.metadata.sessionID}`,
    latencyMs: 0,
    parsedOutput: { error: errorMessage },
  };
}

/**
 * Convert internal LLMTrace (from trace.ts) to the model-level LLMTrace
 * (from normalize/models.ts) for persistence.
 */
function convertTraceToModel(
  internalTrace: InternalLLMTrace,
  promptSetVersion: PromptSetVersion,
  stage: "session-claims",
  packet: SessionMapPacket,
  options?: {
    cache?: LLMTrace["cache"];
    finishReason?: LLMFinishReason;
    warnings?: Array<LLMTraceWarning>;
  },
): LLMTrace {
  return {
    schemaVersion: "llm-trace/v1",
    traceID: internalTrace.traceID,
    timestamp: internalTrace.timestamp,
    promptSetVersion,
    stage,
    provider: internalTrace.provider,
    model: internalTrace.model,
    inputArtifactRef: internalTrace.inputArtifactRef,
    cache: options?.cache,
    warnings: options?.warnings,
    request: {
      promptName: packet.promptID,
      messages: [
        { role: "system", content: packet.systemPrompt },
        { role: "user", content: `[payload: ${packet.metadata.tokenEstimate} tokens, ${packet.metadata.evidenceCount} evidence items]` },
      ],
    },
    response: {
      finishReason: options?.finishReason ?? "unknown",
      rawText: typeof internalTrace.rawOutput === "string" ? internalTrace.rawOutput : "",
      structuredOutput: {
        kind: "candidate-claims",
        claims: (internalTrace.parsedOutput as { claims?: Array<CandidateClaim> }).claims ?? [],
      },
    },
    usage: internalTrace.usage,
  };
}

function materializeCachedTrace(
  trace: LLMTrace | undefined,
  cacheKey: string,
  cachedAt: string,
): LLMTrace {
  const cachedTrace = structuredClone(trace ?? buildEmptyCachedTrace());
  cachedTrace.timestamp = new Date().toISOString();
  cachedTrace.cache = {
    hit: true,
    key: cacheKey,
    storedAt: cachedAt,
  };
  return cachedTrace;
}

function buildCacheKey(
  cache: LLMCache | undefined,
  packet: SessionMapPacket,
  resolved: ResolvedLlmProvider,
  context: { sessionID: string },
): string | undefined {
  if (!cache) {
    return undefined;
  }

  const normalizedInputHash = cache.hash({
    inputArtifactRef: `session:${context.sessionID}`,
    promptID: packet.promptID,
    systemPrompt: packet.systemPrompt,
    userPayload: packet.userPayload,
    includedEvidenceIDs: packet.includedEvidenceIDs,
  });

  return cache.hash({
    evidenceIndexHash: normalizedInputHash,
    promptVersion: packet.promptVersion,
    model: {
      provider: resolved.provider.provider,
      ...resolved.model,
    },
  });
}

function classifyLlmFailure(error: unknown): { message: string; warning: LLMTraceWarning } {
  const message = toErrorMessage(error);
  const normalized = message.toLowerCase();
  const cause = getCauseMessage(error);

  if (normalized.includes("timed out") || normalized.includes("timeout")) {
    return {
      message,
      warning: { code: "provider-timeout", message },
    };
  }

  if (
    normalized.includes("invalid json")
    || normalized.includes("malformed")
    || normalized.includes("empty structured response")
    || normalized.includes("must be a json object")
  ) {
    return {
      message,
      warning: { code: "provider-malformed-output", message },
    };
  }

  if (cause.includes("fetch") || cause.includes("network") || cause.includes("connect") || cause.includes("socket")) {
    return {
      message,
      warning: { code: "provider-connection-error", message },
    };
  }

  return {
    message,
    warning: { code: "provider-error", message },
  };
}

function getCauseMessage(error: unknown): string {
  if (!(error instanceof LlmProviderError) || !("cause" in error)) {
    return "";
  }

  const cause = (error as { cause?: unknown }).cause;
  return toErrorMessage(cause).toLowerCase();
}

function normalizeFinishReason(reason: string | undefined): LLMFinishReason {
  switch (reason) {
    case "stop":
    case "length":
    case "content-filter":
    case "tool-call":
      return reason;
    default:
      return reason ? "unknown" : "unknown";
  }
}

function buildEmptyCachedTrace(): LLMTrace {
  return {
    schemaVersion: "llm-trace/v1",
    traceID: generateTraceID(),
    timestamp: new Date().toISOString(),
    promptSetVersion: "prompt-set/0.0.0",
    stage: "session-claims",
    provider: "cache",
    model: "cache",
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
