import type { LLMTrace } from "../normalize/models.js";
import type { LlmStructuredGenerationResult } from "../llm/types.js";
import type { ResolvedLlmProvider } from "../llm/provider.js";
import type { PromptRegistry } from "../llm/prompts/registry.js";
import type { ClaimManifest, HarnessBudget, VerifierReport, VerifierCheckedItem, VerifierIssue } from "./types.js";
import { generateTraceID } from "../llm/trace.js";
import { buildVerifierPacket } from "./packets.js";
import { resolveHarnessBudget } from "./stage-runner.js";
import { LlmProviderError } from "../shared/errors.js";

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

const VERIFIER_MAX_RETRIES = 2;

export async function runVerifierStage(
  skillMarkdown: string,
  manifest: ClaimManifest,
  provider: ResolvedLlmProvider,
  registry?: PromptRegistry,
  budget?: Partial<HarnessBudget>,
): Promise<VerifierStageResult> {
  const resolvedBudget = resolveHarnessBudget(budget);
  const packet = buildVerifierPacket(skillMarkdown, manifest, registry);
  const markdownDirectives = extractMarkdownDirectives(skillMarkdown);

  let lastResult: LlmStructuredGenerationResult<RawVerifierOutput> | undefined;
  let report: VerifierReport | undefined;

  for (let attempt = 0; attempt <= VERIFIER_MAX_RETRIES; attempt++) {
    const traceID = generateTraceID();

    let result: LlmStructuredGenerationResult<RawVerifierOutput>;
    try {
      result = await provider.provider.generateStructured<RawVerifierOutput>({
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
    } catch {
      if (attempt < VERIFIER_MAX_RETRIES) continue;
      throw new LlmProviderError(`Verifier stage failed after ${VERIFIER_MAX_RETRIES + 1} attempts`, {
        provider: provider.provider.provider,
        retryable: false,
      });
    }

    lastResult = result;
    report = parseVerifierOutput(result.object, manifest, skillMarkdown);

    if (markdownDirectives.length === 0 || report.checkedItems.length > 0) {
      return {
        report,
        trace: {
          schemaVersion: "llm-trace/v1",
          traceID,
          timestamp: new Date().toISOString(),
          promptSetVersion: "prompt-set/v1",
          stage: "harness-verifier",
          provider: result.metadata.provider,
          model: result.metadata.model,
          inputArtifactRef: `harness:verifier${attempt > 0 ? `:retry-${attempt}` : ""}`,
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
        },
      };
    }
  }

  const exhaustedTraceID = generateTraceID();
  const exhaustedTrace: LLMTrace = {
    schemaVersion: "llm-trace/v1",
    traceID: exhaustedTraceID,
    timestamp: new Date().toISOString(),
    promptSetVersion: "prompt-set/v1",
    stage: "harness-verifier",
    provider: lastResult!.metadata.provider,
    model: lastResult!.metadata.model,
    inputArtifactRef: "harness:verifier:retries-exhausted",
    request: {
      promptName: packet.promptId,
      messages: packet.messages.map((m) => ({ role: m.role, content: m.content })),
    },
    response: {
      finishReason: (lastResult!.finishReason as LLMTrace["response"]["finishReason"]) ?? "stop",
      rawText: lastResult!.rawText,
      structuredOutput: { kind: "skill-plan", plan: null as never },
    },
    usage: lastResult!.metadata.usage,
  };

  return { report: report!, trace: exhaustedTrace };
}

const VALID_STATUSES = new Set(["verified", "unreferenced", "fabricated"]);
const VALID_SEVERITIES = new Set(["high", "medium", "low"]);

function parseVerifierOutput(raw: RawVerifierOutput, manifest: ClaimManifest, skillMarkdown: string): VerifierReport {
  const validClaimIds = new Set(manifest.claims.map((c) => c.id));
  const claimsById = new Map(manifest.claims.map((claim) => [claim.id, claim]));
  const markdownDirectives = extractMarkdownDirectives(skillMarkdown);

  const rawChecked = raw.checkedItems ?? raw.checked_items ?? [];
  const parsedCheckedItems: Array<VerifierCheckedItem> = (Array.isArray(rawChecked) ? rawChecked : [])
    .filter((item) => {
      const directiveText = item.directive ?? item.directive_text ?? item.text;
      return directiveText && typeof directiveText === "string";
    })
    .map((item) => {
      const status = VALID_STATUSES.has(String(item.status)) ? String(item.status) : "unreferenced";
      const rawClaimId = item.claimId ?? item.claim_id;
      const claimId = rawClaimId != null ? String(rawClaimId) : null;
      const directive = String(item.directive ?? item.directive_text ?? item.text).trim();
      const normalizedStatus = normalizeCheckedStatus({
        directive,
        status: status as VerifierCheckedItem["status"],
        claimId,
        validClaimIds,
        claimsById,
      });

      return {
        directive,
        claimId,
        status: normalizedStatus,
      };
    });

  const issues: Array<VerifierIssue> = (Array.isArray(raw.issues) ? raw.issues : [])
    .filter((i) => i.description && typeof i.description === "string")
    .map((i) => ({
      description: String(i.description),
      location: String(i.location ?? "unknown"),
      severity: (VALID_SEVERITIES.has(String(i.severity)) ? String(i.severity) : "low") as VerifierIssue["severity"],
    }));

  const { checkedItems, reconciliationIssues } = reconcileCheckedItemsWithMarkdown(
    parsedCheckedItems,
    markdownDirectives,
    validClaimIds,
    claimsById,
    manifest.claims.length,
  );
  issues.push(...reconciliationIssues);

  const hasInvalidItem = checkedItems.some((item) => item.status !== "verified");
  const hasBlockingIssue = issues.some((issue) => issue.severity === "high" || issue.severity === "medium");
  const pass = (typeof raw.pass === "boolean" ? raw.pass : true) && !hasInvalidItem && !hasBlockingIssue;

  const verifiedCount = checkedItems.filter((item) => item.status === "verified").length;
  const fabricatedCount = checkedItems.filter((item) => item.status === "fabricated").length;

  return {
    schemaVersion: "verifier-report/v1",
    pass,
    checkedItems,
    issues,
    metadata: {
      generatedAt: new Date().toISOString(),
      directiveCount: markdownDirectives.length,
      verifiedCount,
      fabricatedCount,
    },
  };
}

type MarkdownDirective = {
  text: string;
  location: string;
};

function extractMarkdownDirectives(markdown: string): Array<MarkdownDirective> {
  const directives: Array<MarkdownDirective> = [];
  const lines = markdown.split(/\r?\n/);
  let currentHeading = "document";
  let inFrontmatter = false;
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (index === 0 && line.trim() === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (line.trim() === "---") {
        inFrontmatter = false;
      }
      continue;
    }
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      currentHeading = headingMatch[2] ?? "document";
      continue;
    }

    const bulletMatch = /^\s*[-*]\s+(.+?)\s*$/.exec(line);
    if (bulletMatch) {
      const text = cleanDirectiveText(bulletMatch[1] ?? "");
      if (text) {
        directives.push({
          text,
          location: `${currentHeading} directive ${directives.length + 1}`,
        });
      }
      continue;
    }

    const prose = cleanDirectiveText(line);
    if (prose) {
      directives.push({
        text: prose,
        location: `${currentHeading} directive ${directives.length + 1}`,
      });
    }
  }

  return directives;
}

function normalizeCheckedStatus(input: {
  directive: string;
  status: VerifierCheckedItem["status"];
  claimId: string | null;
  validClaimIds: Set<string>;
  claimsById: Map<string, { label: string; rationale: string; dimension: string }>;
}): VerifierCheckedItem["status"] {
  if (input.status === "fabricated") {
    return "fabricated";
  }
  if (!input.claimId || !input.validClaimIds.has(input.claimId)) {
    return "unreferenced";
  }
  if (input.status === "verified") {
    const claim = input.claimsById.get(input.claimId);
    if (!claim || !isDirectiveGroundedInClaim(input.directive, claim)) {
      return "fabricated";
    }
  }
  return input.status;
}

function reconcileCheckedItemsWithMarkdown(
  parsedCheckedItems: Array<VerifierCheckedItem>,
  markdownDirectives: Array<MarkdownDirective>,
  validClaimIds: Set<string>,
  claimsById: Map<string, { label: string; rationale: string; dimension: string }>,
  claimCount: number,
): { checkedItems: Array<VerifierCheckedItem>; reconciliationIssues: Array<VerifierIssue> } {
  const checkedItems = [...parsedCheckedItems];
  const reconciliationIssues: Array<VerifierIssue> = [];

  const unmatchedDirectives = new Set(
    markdownDirectives.map((d, index) => index),
  );

  for (const item of checkedItems) {
    const directiveIndex = markdownDirectives.findIndex((d) => d.text === item.directive || d.text.includes(item.directive) || item.directive.includes(d.text));
    if (directiveIndex >= 0) {
      unmatchedDirectives.delete(directiveIndex);
    }
  }

  for (const index of unmatchedDirectives) {
    const directive = markdownDirectives[index];
    reconciliationIssues.push({
      description: `Verifier did not check directive: "${directive.text}"`,
      location: directive.location,
      severity: "medium",
    });
  }

  if (checkedItems.length === 0 && markdownDirectives.length > 0) {
    reconciliationIssues.push({
      description: "Verifier returned no checked items, but markdown contains directives.",
      location: "verifier-report",
      severity: "high",
    });
  }

  return { checkedItems, reconciliationIssues };
}

function isDirectiveGroundedInClaim(directive: string, claim: { label: string; rationale: string; dimension: string }): boolean {
  const normalizedDirective = directive.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedLabel = claim.label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedRationale = claim.rationale.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  if (!normalizedDirective || !normalizedLabel) {
    return false;
  }

  const directiveTokens = new Set(normalizedDirective.split(" "));
  const labelTokens = normalizedLabel.split(" ");
  const matchedLabelTokens = labelTokens.filter((token) => directiveTokens.has(token));

  if (matchedLabelTokens.length >= Math.max(1, Math.ceil(labelTokens.length * 0.5))) {
    return true;
  }

  if (normalizedRationale) {
    const rationaleTokens = new Set(normalizedRationale.split(" "));
    const matchedRationaleTokens = [...directiveTokens].filter((token) => rationaleTokens.has(token));
    if (matchedRationaleTokens.length >= 2) {
      return true;
    }
  }

  return false;
}

function cleanDirectiveText(text: string): string {
  return text.trim().replace(/^[-*>]\s*/, "").trim();
}
