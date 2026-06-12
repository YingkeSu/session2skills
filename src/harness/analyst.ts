import type { LLMTrace } from "../normalize/models.js";
import type { LlmStructuredGenerationResult } from "../llm/types.js";
import type { ResolvedLlmProvider } from "../llm/provider.js";
import type { PromptRegistry } from "../llm/prompts/registry.js";
import type { EvidenceItem, NormalizedSession } from "../normalize/models.js";
import type { ClaimManifest, HarnessBudget } from "./types.js";
import { generateTraceID } from "../llm/trace.js";
import { buildAnalystPacket } from "./packets.js";
import { resolveHarnessBudget } from "./stage-runner.js";
import { LlmProviderError } from "../shared/errors.js";

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
): Promise<AnalystStageResult> {
  const resolvedBudget = resolveHarnessBudget(budget);
  const packet = buildAnalystPacket(sessions, evidence, registry);

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
            if (!value || typeof value !== "object") return {};
            return value as RawAnalystOutput;
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
    manifest = parseAnalystOutput(result.object, sessions.length, evidence.length);

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
          structuredOutput: { kind: "candidate-claims", claims: [] },
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
      structuredOutput: { kind: "candidate-claims", claims: [] },
    },
    usage: lastResult!.metadata.usage,
  };

  return { manifest: manifest!, trace: exhaustedTrace };
}

function parseAnalystOutput(
  raw: RawAnalystOutput,
  sessionCount: number,
  evidenceCount: number,
): ClaimManifest {
  const rawClaims = Array.isArray(raw.claims) ? raw.claims : [];

  const claims = rawClaims
    .filter((c) => c.dimension && c.label && typeof c.confidence === "number")
    .map((c, i) => {
      const evidenceRefsRaw = c.evidenceRefs ?? c.evidence_ids;
      return {
        id: c.id ? String(c.id) : `claim_${String(i + 1).padStart(3, "0")}`,
        dimension: String(c.dimension) as ClaimManifest["claims"][number]["dimension"],
        label: String(c.label),
        confidence: Math.max(0, Math.min(1, Number(c.confidence) || 0)),
        rationale: String(c.rationale ?? c.reasoning ?? ""),
        evidenceRefs: Array.isArray(evidenceRefsRaw)
          ? evidenceRefsRaw.filter((r): r is string => typeof r === "string")
          : [],
      };
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
