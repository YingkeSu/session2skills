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

  const report = parseVerifierOutput(result.object, manifest, skillMarkdown);

  const trace: LLMTrace = {
    schemaVersion: "llm-trace/v1",
    traceID,
    timestamp: new Date().toISOString(),
    promptSetVersion: "prompt-set/v1",
    stage: "harness-verifier",
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
      directiveCount: checkedItems.length,
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
  manifestClaimCount: number,
): {
  checkedItems: Array<VerifierCheckedItem>;
  reconciliationIssues: Array<VerifierIssue>;
} {
  const checkedItems = [...parsedCheckedItems];
  const issues: Array<VerifierIssue> = [];
  const matchedMarkdownIndexes = new Set<number>();

  for (const item of parsedCheckedItems) {
    const matchIndex = markdownDirectives.findIndex((directive, index) =>
      !matchedMarkdownIndexes.has(index) && directivesMatch(directive.text, item.directive)
    );

    if (matchIndex === -1) {
      issues.push({
        description: "Verifier checked a directive that does not appear in the rendered SKILL.md.",
        location: item.directive,
        severity: "high",
      });
    } else {
      matchedMarkdownIndexes.add(matchIndex);
    }

    if (item.status === "verified") {
      if (!item.claimId || !validClaimIds.has(item.claimId)) {
        issues.push({
          description: "Verifier marked a directive verified with an unknown claim ID.",
          location: item.directive,
          severity: "high",
        });
      } else {
        const claim = claimsById.get(item.claimId);
        if (!claim || !isDirectiveGroundedInClaim(item.directive, claim)) {
          issues.push({
            description: "Verifier marked a directive verified even though it is not textually grounded in the cited claim.",
            location: item.directive,
            severity: "high",
          });
        }
      }
    }
  }

  for (let index = 0; index < markdownDirectives.length; index += 1) {
    if (matchedMarkdownIndexes.has(index)) {
      continue;
    }
    const markdownDirective = markdownDirectives[index]!;
    checkedItems.push({
      directive: markdownDirective.text,
      claimId: null,
      status: "unreferenced",
    });
    issues.push({
      description: "Rendered SKILL.md contains a directive that the verifier did not check.",
      location: markdownDirective.location,
      severity: "high",
    });
  }

  if (manifestClaimCount > 0 && markdownDirectives.length === 0) {
    issues.push({
      description: "Rendered SKILL.md contains no checkable directives despite having source claims.",
      location: "SKILL.md",
      severity: "high",
    });
  }

  return { checkedItems, reconciliationIssues: issues };
}

function isDirectiveGroundedInClaim(
  directive: string,
  claim: { label: string; rationale: string; dimension: string },
): boolean {
  const directiveTokens = significantTokens(directive);
  if (directiveTokens.size === 0) {
    return false;
  }

  const claimTokens = significantTokens(`${claim.label} ${claim.rationale} ${claim.dimension}`);
  for (const token of directiveTokens) {
    if (claimTokens.has(token)) {
      return true;
    }
  }
  return false;
}

function directivesMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return true;
  }

  const leftTokens = significantTokens(left);
  const rightTokens = significantTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return false;
  }

  const smaller = leftTokens.size <= rightTokens.size ? leftTokens : rightTokens;
  const larger = leftTokens.size <= rightTokens.size ? rightTokens : leftTokens;
  const overlap = [...smaller].filter((token) => larger.has(token)).length;
  return overlap / smaller.size >= 0.75;
}

function cleanDirectiveText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+\(confidence:\s*\d+(?:\.\d+)?\)\s*$/i, "")
    .trim();
}

function significantTokens(text: string): Set<string> {
  const stopWords = new Set([
    "about",
    "adapt",
    "agent",
    "before",
    "behavior",
    "claim",
    "code",
    "decisions",
    "developer",
    "ground",
    "guidance",
    "making",
    "observed",
    "pattern",
    "prefer",
    "skill",
    "source",
    "this",
    "user",
    "when",
    "with",
    "workflow",
  ]);
  return new Set(
    normalizeText(text)
      .split(" ")
      .filter((token) => token.length >= 4 && !stopWords.has(token)),
  );
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
