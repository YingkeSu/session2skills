import type { LLMTrace } from "../normalize/models.js";
import type { LlmStructuredGenerationResult } from "../llm/types.js";
import type { ResolvedLlmProvider } from "../llm/provider.js";
import type { PromptRegistry } from "../llm/prompts/registry.js";
import type { ClaimManifest, HarnessBudget, VerifierReport, VerifierCheckedItem, VerifierIssue } from "./types.js";
import { generateTraceID } from "../llm/trace.js";
import { buildVerifierPacket } from "./packets.js";
import { resolveHarnessBudget } from "./stage-runner.js";
import { LlmProviderError } from "../shared/errors.js";

type RawCheckedItem = {
  directive?: unknown;
  directive_text?: unknown;
  text?: unknown;
  claimId?: unknown;
  claim_id?: unknown;
  claimIds?: unknown;
  claim_ids?: unknown;
  status?: unknown;
};

type RawVerifierOutput = {
  pass?: unknown;
  checkedItems?: Array<RawCheckedItem>;
  checked_items?: Array<RawCheckedItem>;
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
  cachedClaimsJson?: string,
): Promise<VerifierStageResult> {
  const resolvedBudget = resolveHarnessBudget(budget);
  const packet = buildVerifierPacket(skillMarkdown, manifest, registry, cachedClaimsJson);
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
    },
    usage: lastResult!.metadata.usage,
  };

  return { report: report!, trace: exhaustedTrace };
}

const VALID_STATUSES = new Set(["verified", "unreferenced", "fabricated"]);
const VALID_SEVERITIES = new Set(["high", "medium", "low"]);

function extractClaimId(item: RawCheckedItem): string | null {
  const singular = item.claimId ?? item.claim_id;
  if (singular != null) {
    return String(singular);
  }
  const plural = item.claimIds ?? item.claim_ids;
  if (Array.isArray(plural) && plural.length > 0) {
    return String(plural[0]);
  }
  return null;
}

function inferClaimIdFromDirective(
  directive: string,
  claims: ReadonlyArray<{ id: string; label: string; rationale: string; dimension: string }>,
): string | null {
  const directiveTokens = new Set(
    directive
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .filter((t) => !STOPWORDS.has(t) && t.length > 0),
  );
  if (directiveTokens.size === 0) return null;

  let bestId: string | null = null;
  let bestScore = 0;

  for (const claim of claims) {
    const labelTokens = claim.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .filter((t) => !STOPWORDS.has(t));
    const matched = labelTokens.filter((t) => directiveTokens.has(t));
    const score = matched.length;
    if (score > bestScore) {
      bestScore = score;
      bestId = claim.id;
    }

    const rationaleTokens = claim.rationale
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .filter((t) => !STOPWORDS.has(t));
    const rationaleMatched = rationaleTokens.filter((t) => directiveTokens.has(t));
    if (rationaleMatched.length >= 3 && rationaleMatched.length > bestScore) {
      bestScore = rationaleMatched.length;
      bestId = claim.id;
    }
  }

  return bestScore >= 1 ? bestId : null;
}

function parseVerifierOutput(raw: RawVerifierOutput, manifest: ClaimManifest, skillMarkdown: string): VerifierReport {
  const validClaimIds = new Set(manifest.claims.map((c) => c.id));
  const claimsById = new Map(manifest.claims.map((claim) => [claim.id, claim]));
  const markdownDirectives = extractMarkdownDirectives(skillMarkdown);

  // Writer renders behavioral translations (e.g. "Limit explanations to 2-3 sentences" for label "concise").
  // Token-overlap on the label cannot validate those, so we also match by dimension.
  const claimsByDimension = new Map<string, Array<{ id: string; label: string; rationale: string; dimension: string }>>();
  for (const claim of manifest.claims) {
    const existing = claimsByDimension.get(claim.dimension) ?? [];
    existing.push(claim);
    claimsByDimension.set(claim.dimension, existing);
  }

  const rawChecked = raw.checkedItems ?? raw.checked_items ?? [];
  const parsedCheckedItems: Array<VerifierCheckedItem> = (Array.isArray(rawChecked) ? rawChecked : [])
    .filter((item) => {
      const directiveText = item.directive ?? item.directive_text ?? item.text;
      return directiveText && typeof directiveText === "string";
    })
    .map((item) => {
      const status = VALID_STATUSES.has(String(item.status)) ? String(item.status) : "unreferenced";
      let claimId = extractClaimId(item);
      const directive = String(item.directive ?? item.directive_text ?? item.text).trim();

      if (!claimId) {
        claimId = inferClaimIdFromDirective(directive, manifest.claims);
      }

      const normalizedStatus = normalizeCheckedStatus({
        directive,
        status: status as VerifierCheckedItem["status"],
        claimId,
        validClaimIds,
        claimsById,
        claimsByDimension,
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

    const bulletMatch = /^\s*(?:[-*]|\d+\.)\s+(.+?)\s*$/.exec(line);
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
  }

  return directives;
}

function normalizeCheckedStatus(input: {
  directive: string;
  status: VerifierCheckedItem["status"];
  claimId: string | null;
  validClaimIds: Set<string>;
  claimsById: Map<string, { label: string; rationale: string; dimension: string }>;
  claimsByDimension: Map<string, Array<{ id: string; label: string; rationale: string; dimension: string }>>;
}): VerifierCheckedItem["status"] {
  if (input.status === "fabricated") {
    return "fabricated";
  }
  if (!input.claimId || !input.validClaimIds.has(input.claimId)) {
    return "unreferenced";
  }
  if (input.status === "verified") {
    const claim = input.claimsById.get(input.claimId);
    if (!claim) {
      return "fabricated";
    }
    if (isDirectiveGroundedInClaim(input.directive, claim)) {
      return "verified";
    }
    // Writer produces behavioral translations that may not share tokens with the
    // claim's label. For dimensions with few claims, trust the LLM mapping if the
    // directive has non-stopword content (guards against empty/garbage directives).
    const directiveTokens = input.directive
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .filter((t) => !STOPWORDS.has(t));
    if (directiveTokens.length > 0) {
      const dimensionClaims = input.claimsByDimension.get(claim.dimension) ?? [];
      if (dimensionClaims.length <= 2) {
        return "verified";
      }
    }
    return "fabricated";
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
    if (directive === undefined) continue;
    reconciliationIssues.push({
      description: `Verifier did not check directive: "${directive.text}"`,
      location: directive.location,
      severity: "low",
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

const STOPWORDS = new Set(["the", "a", "an", "is", "to", "of", "in", "for", "on", "with", "and", "or", "but", "not", "be", "this", "that", "it", "as", "at", "by", "from", "was", "are", "will", "can", "has", "have", "do", "if", "so", "no", "we", "you", "they", "i"]);

function isDirectiveGroundedInClaim(directive: string, claim: { label: string; rationale: string; dimension: string }): boolean {
  const normalizedDirective = directive.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedLabel = claim.label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedRationale = claim.rationale.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  if (!normalizedDirective || !normalizedLabel) {
    return false;
  }

  const directiveTokens = new Set(
    normalizedDirective.split(" ").filter((t) => !STOPWORDS.has(t)),
  );
  const labelTokens = normalizedLabel.split(" ").filter((t) => !STOPWORDS.has(t));
  const matchedLabelTokens = labelTokens.filter((token) => directiveTokens.has(token));

  if (matchedLabelTokens.length >= Math.max(1, Math.ceil(labelTokens.length * 0.6))) {
    return true;
  }

  if (normalizedRationale) {
    const rationaleTokens = normalizedRationale.split(" ").filter((t) => !STOPWORDS.has(t));
    const matchedRationaleTokens = rationaleTokens.filter((token) => directiveTokens.has(token));
    if (matchedRationaleTokens.length >= 3) {
      return true;
    }
  }

  return false;
}

function cleanDirectiveText(text: string): string {
  return text.trim().replace(/^[-*>]\s*/, "").trim();
}
