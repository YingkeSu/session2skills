import type { LLMTrace } from "../normalize/models.js";
import type { ResolvedLlmProvider } from "../llm/provider.js";
import type { PromptRegistry } from "../llm/prompts/registry.js";
import type { EvidenceItem } from "../normalize/models.js";
import type { ClaimManifest, HarnessBudget, SkepticReport } from "./types.js";
import { DEFAULT_HARNESS_BUDGET } from "./types.js";
import { generateTraceID } from "../llm/trace.js";
import { buildSkepticPacket } from "./packets.js";

type RawSkepticOutput = {
  issues?: Array<{
    claimId?: unknown;
    claim_id?: unknown;
    severity?: unknown;
    problemType?: unknown;
    problem_type?: unknown;
    type?: unknown;
    detail?: unknown;
    suggestion?: unknown;
  }>;
  overallScore?: unknown;
  overall_score?: unknown;
  score?: unknown;
};

export type SkepticStageResult = {
  report: SkepticReport;
  trace: LLMTrace;
};

export async function runSkepticStage(
  manifest: ClaimManifest,
  evidence: ReadonlyArray<EvidenceItem>,
  provider: ResolvedLlmProvider,
  registry?: PromptRegistry,
  budget?: Partial<HarnessBudget>,
): Promise<SkepticStageResult> {
  const resolvedBudget = { ...DEFAULT_HARNESS_BUDGET, ...budget };
  const packet = buildSkepticPacket(manifest, evidence, registry);
  const traceID = generateTraceID();

  const result = await provider.provider.generateStructured<RawSkepticOutput>({
    model: provider.model,
    messages: packet.messages,
    temperature: resolvedBudget.temperature,
    maxOutputTokens: resolvedBudget.maxOutputTokens,
    options: { timeoutMs: resolvedBudget.timeoutMs },
    schema: {
      name: packet.schema.name,
      description: packet.schema.description,
      schema: packet.schema.schema,
      parse: (value: unknown): RawSkepticOutput => {
        if (!value || typeof value !== "object") return {};
        return value as RawSkepticOutput;
      },
    },
  });

  const report = parseSkepticOutput(result.object, manifest.claims.length);

  const trace: LLMTrace = {
    schemaVersion: "llm-trace/v1",
    traceID,
    timestamp: new Date().toISOString(),
    promptSetVersion: "prompt-set/v1",
    stage: "harness-skeptic",
    provider: result.metadata.provider,
    model: result.metadata.model,
    inputArtifactRef: "harness:skeptic",
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

  return { report, trace };
}

function parseSkepticOutput(raw: RawSkepticOutput, claimCount: number): SkepticReport {
  const rawIssues = Array.isArray(raw.issues) ? raw.issues : [];

  const validSeverities = new Set(["high", "medium", "low"]);
  const validProblemTypes = new Set(["unsupported", "contradicted", "overconfident", "vague", "duplicate"]);

  const issues = rawIssues
    .filter((i) => (i.claimId ?? i.claim_id) && i.severity && (i.problemType ?? i.problem_type ?? i.type))
    .map((i) => ({
      claimId: String(i.claimId ?? i.claim_id),
      severity: (validSeverities.has(String(i.severity)) ? String(i.severity) : "low") as SkepticReport["issues"][number]["severity"],
      problemType: (validProblemTypes.has(String(i.problemType ?? i.problem_type ?? i.type)) ? String(i.problemType ?? i.problem_type ?? i.type) : "vague") as SkepticReport["issues"][number]["problemType"],
      detail: String(i.detail ?? ""),
      suggestion: String(i.suggestion ?? ""),
    }));

  const rawScore = raw.overallScore ?? raw.overall_score ?? raw.score;
  const overallScore = typeof rawScore === "number"
    ? Math.max(0, Math.min(1, rawScore))
    : issues.length === 0 ? 1.0 : Math.max(0, 1 - issues.length * 0.15);

  return {
    schemaVersion: "skeptic-report/v1",
    issues,
    overallScore,
    metadata: {
      generatedAt: new Date().toISOString(),
      claimCount,
      issueCount: issues.length,
    },
  };
}
