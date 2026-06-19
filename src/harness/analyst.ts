import type { LLMTrace } from "../normalize/models.js";
import type { LlmStructuredGenerationResult } from "../llm/types.js";
import type { ResolvedLlmProvider } from "../llm/provider.js";
import type { PromptRegistry } from "../llm/prompts/registry.js";
import type { EvidenceItem, NormalizedSession } from "../normalize/models.js";
import type { ClaimManifest, HarnessBudget } from "./types.js";
import type { EvidenceConfig } from "./packets.js";
import { generateTraceID } from "../llm/trace.js";
import { buildAnalystPacket } from "./packets.js";
import { resolveHarnessBudget } from "./stage-runner.js";
import { LlmProviderError } from "../shared/errors.js";
import { HARNESS_DIMENSIONS_ENUM, HARNESS_LABELS } from "../llm/prompts/definitions.js";

type RawAnalystOutput = {
  claims?: Array<{
    id?: unknown;
    dimension?: unknown;
    label?: unknown;
    confidence?: unknown;
    rationale?: unknown;
    reasoning?: unknown;
    evidenceRefs?: unknown;
    evidence_ids?: unknown;
    evidence?: unknown;
  }>;
  evidenceSummary?: unknown;
  dimensionsCovered?: unknown;
};

export type AnalystStageResult = {
  manifest: ClaimManifest;
  trace: LLMTrace;
};

const ANALYST_MAX_RETRIES = 2;

export async function runAnalystStage(
  sessions: ReadonlyArray<NormalizedSession>,
  evidence: ReadonlyArray<EvidenceItem>,
  provider: ResolvedLlmProvider,
  registry?: PromptRegistry,
  budget?: Partial<HarnessBudget>,
  selectedDimensions?: ReadonlyArray<string>,
  evidenceConfig?: EvidenceConfig,
): Promise<AnalystStageResult> {
  const resolvedBudget = resolveHarnessBudget(budget);
  const packet = await buildAnalystPacket(sessions, evidence, registry, evidenceConfig?.tokenBudget ?? 160000, selectedDimensions, evidenceConfig);
  const knownEvidenceIds = new Set(evidence.map((e) => e.evidenceID));

  let lastResult: LlmStructuredGenerationResult<RawAnalystOutput> | undefined;
  let manifest: ClaimManifest | undefined;

  for (let attempt = 0; attempt <= ANALYST_MAX_RETRIES; attempt++) {
    const traceID = generateTraceID();

    let result: LlmStructuredGenerationResult<RawAnalystOutput>;
    try {
      result = await provider.provider.generateStructured<RawAnalystOutput>({
        model: provider.model,
        messages: packet.messages,
        temperature: resolvedBudget.temperature,
        maxOutputTokens: resolvedBudget.maxOutputTokens,
        options: { timeoutMs: resolvedBudget.timeoutMs },
        schema: {
          name: packet.schema.name,
          description: packet.schema.description,
          schema: packet.schema.schema,
          parse: (value: unknown): RawAnalystOutput => {
            if (!value || typeof value !== "object" || Array.isArray(value)) return {};
            const obj = value as Record<string, unknown>;
            if (obj.claims != null && !Array.isArray(obj.claims)) {
              obj.claims = [];
            }
            return obj as RawAnalystOutput;
          },
        },
      });
    } catch {
      if (attempt < ANALYST_MAX_RETRIES) continue;
      throw new LlmProviderError(`Analyst stage failed after ${ANALYST_MAX_RETRIES + 1} attempts`, {
        provider: provider.provider.provider,
        retryable: false,
      });
    }

    lastResult = result;
    manifest = parseAnalystOutput(result.object, sessions.length, evidence.length, knownEvidenceIds, selectedDimensions);

    if (manifest.claims.length > 0) {
      const trace: LLMTrace = {
        schemaVersion: "llm-trace/v1",
        traceID,
        timestamp: new Date().toISOString(),
        promptSetVersion: "prompt-set/v1",
        stage: "harness-analyst",
        provider: result.metadata.provider,
        model: result.metadata.model,
        inputArtifactRef: `harness:analyst:${sessions.length}-sessions${attempt > 0 ? `:retry-${attempt}` : ""}`,
        request: {
          promptName: packet.promptId,
          messages: packet.messages.map((m) => ({ role: m.role, content: m.content })),
        },
        response: {
          finishReason: (result.finishReason as LLMTrace["response"]["finishReason"]) ?? "stop",
          rawText: result.rawText,
        },
        usage: result.metadata.usage,
      };

      return { manifest, trace };
    }
  }

  const traceID = generateTraceID();
  const exhaustedTrace: LLMTrace = {
    schemaVersion: "llm-trace/v1",
    traceID,
    timestamp: new Date().toISOString(),
    promptSetVersion: "prompt-set/v1",
    stage: "harness-analyst",
    provider: lastResult!.metadata.provider,
    model: lastResult!.metadata.model,
    inputArtifactRef: `harness:analyst:${sessions.length}-sessions:retries-exhausted`,
    request: {
      promptName: packet.promptId,
      messages: packet.messages.map((m) => ({ role: m.role, content: m.content })),
    },
    response: {
      finishReason: (lastResult!.finishReason as LLMTrace["response"]["finishReason"]) ?? "stop",
      rawText: lastResult!.rawText,
    },
    usage: lastResult!.metadata.usage,
  };

  return { manifest: manifest!, trace: exhaustedTrace };
}

function parseAnalystOutput(
  raw: RawAnalystOutput,
  sessionCount: number,
  evidenceCount: number,
  knownEvidenceIds: ReadonlySet<string>,
  selectedDimensions?: ReadonlyArray<string>,
): ClaimManifest {
  const rawClaims = Array.isArray(raw.claims) ? raw.claims : [];

  const validDimensions = new Set(HARNESS_DIMENSIONS_ENUM);
  const allowedDimensions = selectedDimensions
    ? new Set(selectedDimensions)
    : null;

  const claims = rawClaims
    .filter((c) => c.dimension && c.label && typeof c.confidence === "number")
    .filter((c) => validDimensions.has(String(c.dimension)))
    .filter((c) => allowedDimensions === null || allowedDimensions.has(String(c.dimension)))
    .filter((c) => {
      const dim = String(c.dimension);
      const allowedLabels = HARNESS_LABELS[dim];
      return allowedLabels ? allowedLabels.includes(String(c.label)) : false;
    })
    .map((c) => {
      const evidenceRefsRaw = c.evidenceRefs ?? c.evidence_ids ?? c.evidence;
      const rawRefs = Array.isArray(evidenceRefsRaw)
        ? evidenceRefsRaw.filter((r): r is string => typeof r === "string")
        : [];
      return {
        raw: c,
        validRefs: rawRefs.filter((r) => knownEvidenceIds.has(r)),
        citedEvidence: rawRefs.length > 0,
      };
    })
    .filter((entry) => !entry.citedEvidence || entry.validRefs.length > 0)
    .map((entry, i) => {
      const rawRationale = String(entry.raw.rationale ?? entry.raw.reasoning ?? "").trim();
      const claim = {
        id: entry.raw.id ? String(entry.raw.id) : `claim_${String(i + 1).padStart(3, "0")}`,
        dimension: String(entry.raw.dimension) as ClaimManifest["claims"][number]["dimension"],
        label: String(entry.raw.label),
        confidence: Math.max(0, Math.min(1, Number(entry.raw.confidence) || 0)),
        rationale: rawRationale,
        evidenceRefs: entry.validRefs,
      };
      if (!claim.rationale) {
        const dimLabels = HARNESS_LABELS[claim.dimension];
        claim.rationale = `Observed ${claim.label} pattern in ${claim.dimension} across ${claim.evidenceRefs.length} evidence item(s).`;
      }
      return claim;
    });

  const dimensionsCovered = Array.isArray(raw.dimensionsCovered)
    ? raw.dimensionsCovered.filter((d): d is string => typeof d === "string")
    : [...new Set(claims.map((c) => c.dimension))] as Array<ClaimManifest["dimensionsCovered"][number]>;

  return {
    schemaVersion: "claim-manifest/v1",
    claims,
    evidenceSummary: typeof raw.evidenceSummary === "string" ? raw.evidenceSummary : "",
    dimensionsCovered: dimensionsCovered as ClaimManifest["dimensionsCovered"],
    metadata: {
      generatedAt: new Date().toISOString(),
      sessionCount,
      totalEvidenceItems: evidenceCount,
    },
  };
}
