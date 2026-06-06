import type { LLMTrace } from "../normalize/models.js";
import type { ResolvedLlmProvider } from "../llm/provider.js";
import type { PromptRegistry } from "../llm/prompts/registry.js";
import type { ClaimManifest, HarnessBudget, VerifierReport, VerifierCheckedItem, VerifierIssue } from "./types.js";
import { DEFAULT_HARNESS_BUDGET } from "./types.js";
import { generateTraceID } from "../llm/trace.js";
import { buildVerifierPacket } from "./packets.js";

type RawVerifierOutput = {
  pass?: unknown;
  checkedItems?: Array<{
    directive?: unknown;
    directive_text?: unknown;
    text?: unknown;
    claimId?: unknown;
    claim_id?: unknown;
    status?: unknown;
  }>;
  checked_items?: Array<{
    directive?: unknown;
    directive_text?: unknown;
    text?: unknown;
    claimId?: unknown;
    claim_id?: unknown;
    status?: unknown;
  }>;
  issues?: Array<{
    description?: unknown;
    location?: unknown;
    severity?: unknown;
  }>;
};

export type VerifierStageResult = {
  report: VerifierReport;
  trace: LLMTrace;
};

export async function runVerifierStage(
  skillMarkdown: string,
  manifest: ClaimManifest,
  provider: ResolvedLlmProvider,
  registry?: PromptRegistry,
  budget?: Partial<HarnessBudget>,
): Promise<VerifierStageResult> {
  const resolvedBudget = { ...DEFAULT_HARNESS_BUDGET, ...budget };
  const packet = buildVerifierPacket(skillMarkdown, manifest, registry);
  const traceID = generateTraceID();
  const startedAt = Date.now();

  const result = await provider.provider.generateStructured<RawVerifierOutput>({
    model: provider.model,
    messages: packet.messages,
    temperature: resolvedBudget.temperature,
    maxOutputTokens: resolvedBudget.maxOutputTokens,
    options: { timeoutMs: resolvedBudget.timeoutMs },
    schema: {
      name: packet.schema.name,
      description: packet.schema.description,
      schema: packet.schema.schema,
      parse: (value: unknown): RawVerifierOutput => {
        if (!value || typeof value !== "object") return {};
        return value as RawVerifierOutput;
      },
    },
  });

  const report = parseVerifierOutput(result.object, manifest);
  const latencyMs = Date.now() - startedAt;

  const trace: LLMTrace = {
    schemaVersion: "llm-trace/v1",
    traceID,
    timestamp: new Date().toISOString(),
    promptSetVersion: "prompt-set/v1",
    stage: "skill-plan",
    provider: result.metadata.provider,
    model: result.metadata.model,
    inputArtifactRef: "harness:verifier",
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

  return { report, trace };
}

const VALID_STATUSES = new Set(["verified", "unreferenced", "fabricated"]);
const VALID_SEVERITIES = new Set(["high", "medium", "low"]);

function parseVerifierOutput(raw: RawVerifierOutput, manifest: ClaimManifest): VerifierReport {
  const validClaimIds = new Set(manifest.claims.map((c) => c.id));

  const rawChecked = raw.checkedItems ?? raw.checked_items ?? [];
  const checkedItems: Array<VerifierCheckedItem> = (Array.isArray(rawChecked) ? rawChecked : [])
    .filter((item) => {
      const directiveText = item.directive ?? item.directive_text ?? item.text;
      return directiveText && typeof directiveText === "string";
    })
    .map((item) => {
      const status = VALID_STATUSES.has(String(item.status)) ? String(item.status) : "unreferenced";
      const rawClaimId = item.claimId ?? item.claim_id;
      const claimId = rawClaimId != null ? String(rawClaimId) : null;

      return {
        directive: String(item.directive ?? item.directive_text ?? item.text),
        claimId,
        status: status as VerifierCheckedItem["status"],
      };
    });

  const issues: Array<VerifierIssue> = (Array.isArray(raw.issues) ? raw.issues : [])
    .filter((i) => i.description && typeof i.description === "string")
    .map((i) => ({
      description: String(i.description),
      location: String(i.location ?? "unknown"),
      severity: (VALID_SEVERITIES.has(String(i.severity)) ? String(i.severity) : "low") as VerifierIssue["severity"],
    }));

  const pass = typeof raw.pass === "boolean" ? raw.pass : !checkedItems.some((item) => item.status === "fabricated");

  const verifiedCount = checkedItems.filter((item) => item.status === "verified").length;
  const fabricatedCount = checkedItems.filter((item) => item.status === "fabricated").length;

  return {
    schemaVersion: "verifier-report/v1",
    pass,
    checkedItems,
    issues,
    metadata: {
      generatedAt: new Date().toISOString(),
      directiveCount: checkedItems.length,
      verifiedCount,
      fabricatedCount,
    },
  };
}
