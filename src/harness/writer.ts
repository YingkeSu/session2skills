import type { LLMTrace } from "../normalize/models.js";
import type { ResolvedLlmProvider } from "../llm/provider.js";
import type { PromptRegistry } from "../llm/prompts/registry.js";
import type { ClaimManifest, HarnessBudget, WriterOutput } from "./types.js";
import { DEFAULT_HARNESS_BUDGET } from "./types.js";
import { generateTraceID } from "../llm/trace.js";
import { buildWriterPacket } from "./packets.js";

type RawWriterOutput = {
  skillMarkdown?: unknown;
  skill_markdown?: unknown;
  sections?: Array<{
    title?: unknown;
    summary?: unknown;
    directives?: Array<{
      text?: unknown;
      sourceClaimId?: unknown;
      source_claim_id?: unknown;
      claim_id?: unknown;
    }>;
    groundingClaimIds?: unknown;
    grounding_claim_ids?: unknown;
    claim_ids?: unknown;
  }>;
};

export type WriterStageResult = {
  output: WriterOutput;
  trace: LLMTrace;
};

export async function runWriterStage(
  manifest: ClaimManifest,
  tone: string,
  provider: ResolvedLlmProvider,
  registry?: PromptRegistry,
  budget?: Partial<HarnessBudget>,
): Promise<WriterStageResult> {
  const resolvedBudget = { ...DEFAULT_HARNESS_BUDGET, ...budget };
  const packet = buildWriterPacket(manifest, tone, registry);
  const traceID = generateTraceID();
  const startedAt = Date.now();

  const result = await provider.provider.generateStructured<RawWriterOutput>({
    model: provider.model,
    messages: packet.messages,
    temperature: resolvedBudget.temperature,
    maxOutputTokens: resolvedBudget.maxOutputTokens,
    options: { timeoutMs: resolvedBudget.timeoutMs },
    schema: {
      name: packet.schema.name,
      description: packet.schema.description,
      schema: packet.schema.schema,
      parse: (value: unknown): RawWriterOutput => {
        if (!value || typeof value !== "object") return {};
        return value as RawWriterOutput;
      },
    },
  });

  const output = parseWriterOutput(result.object, manifest);
  const latencyMs = Date.now() - startedAt;

  const trace: LLMTrace = {
    schemaVersion: "llm-trace/v1",
    traceID,
    timestamp: new Date().toISOString(),
    promptSetVersion: "prompt-set/v1",
    stage: "skill-plan",
    provider: result.metadata.provider,
    model: result.metadata.model,
    inputArtifactRef: "harness:writer",
    request: {
      promptName: packet.promptId,
      messages: packet.messages.map((m) => ({ role: m.role, content: m.content })),
    },
    response: {
      finishReason: (result.finishReason as LLMTrace["response"]["finishReason"]) ?? "stop",
      rawText: result.rawText,
      structuredOutput: { kind: "skill-plan", plan: null as never },
    },
    usage: result.metadata.usage,
  };

  return { output, trace };
}

function parseWriterOutput(raw: RawWriterOutput, manifest: ClaimManifest): WriterOutput {
  const validClaimIds = new Set(manifest.claims.map((c) => c.id));

  const rawMarkdown = raw.skillMarkdown ?? raw.skill_markdown;
  const skillMarkdown = typeof rawMarkdown === "string" && rawMarkdown.trim()
    ? rawMarkdown
    : buildFallbackMarkdown(manifest);

  const rawSections = Array.isArray(raw.sections) ? raw.sections : [];

  const sections = rawSections
    .filter((s) => s.title && typeof s.title === "string")
    .map((s) => {
      const directives = (Array.isArray(s.directives) ? s.directives : [])
        .filter((d) => d.text && typeof d.text === "string")
        .map((d) => ({
          text: String(d.text),
          sourceClaimId: String(d.sourceClaimId ?? d.source_claim_id ?? d.claim_id ?? ""),
        }));

      const rawGroundingIds = s.groundingClaimIds ?? s.grounding_claim_ids ?? s.claim_ids;
      const groundingClaimIds = (Array.isArray(rawGroundingIds) ? rawGroundingIds : [])
        .filter((id): id is string => typeof id === "string" && validClaimIds.has(id));

      return {
        title: String(s.title),
        summary: String(s.summary ?? ""),
        directives,
        groundingClaimIds,
      };
    });

  return { skillMarkdown, sections };
}

function buildFallbackMarkdown(manifest: ClaimManifest): string {
  const lines: Array<string> = ["# Personalized Workflow Skill", ""];

  for (const claim of manifest.claims) {
    lines.push(`## ${claim.dimension}`);
    lines.push(`- ${claim.label} (confidence: ${claim.confidence.toFixed(2)})`);
    lines.push(`  ${claim.rationale}`);
    lines.push("");
  }

  return lines.join("\n");
}
