import type {
  EvidenceItem,
  EvidenceItemSchemaVersion,
  NormalizedMessage,
  NormalizedPart,
  NormalizedSession,
  ToolInvocation,
} from "../normalize/models.js";
import {
  makeEvidenceID,
  makeExcerpt,
  estimateTokens,
} from "../shared/evidence.js";

export { makeEvidenceID, makeExcerpt, estimateTokens } from "../shared/evidence.js";

export const EVIDENCE_ITEM_SCHEMA_VERSION: EvidenceItemSchemaVersion = "evidence-item/v1";

function buildMessageEvidenceItem(
  sessionID: string,
  message: NormalizedMessage,
): EvidenceItem {
  const evidenceID = makeEvidenceID(sessionID, message.id);
  const excerpt = makeExcerpt(message.text);

  return {
    schemaVersion: EVIDENCE_ITEM_SCHEMA_VERSION,
    evidenceID,
    citation: {
      evidenceID,
      sessionID,
      messageID: message.id,
      sourceType: "message",
      excerpt,
    },
    summaryText: excerpt,
  };
}

function buildPartEvidenceItem(
  sessionID: string,
  message: NormalizedMessage,
  part: NormalizedPart,
): EvidenceItem {
  const evidenceID = makeEvidenceID(sessionID, message.id, part.id);
  const excerpt = makeExcerpt(part.text ?? part.title ?? "");

  return {
    schemaVersion: EVIDENCE_ITEM_SCHEMA_VERSION,
    evidenceID,
    citation: {
      evidenceID,
      sessionID,
      messageID: message.id,
      partID: part.id,
      sourceType: part.toolName ? "tool" : "part",
      excerpt,
    },
    summaryText: excerpt,
  };
}

function buildToolEvidenceItem(
  sessionID: string,
  tool: ToolInvocation,
): EvidenceItem {
  const evidenceID = makeEvidenceID(sessionID, tool.id);
  const rawText = [
    tool.title ? `Tool: ${tool.toolName} — ${tool.title}` : `Tool: ${tool.toolName}`,
    tool.output ? makeExcerpt(tool.output) : "",
    tool.input ? makeExcerpt(JSON.stringify(tool.input)) : "",
  ].filter(Boolean).join("\n");
  const excerpt = makeExcerpt(rawText);

  return {
    schemaVersion: EVIDENCE_ITEM_SCHEMA_VERSION,
    evidenceID,
    citation: {
      evidenceID,
      sessionID,
      sourceType: "tool",
      excerpt,
    },
    summaryText: excerpt,
  };
}

export function buildEvidenceIndex(
  sessions: Array<NormalizedSession>,
): Array<EvidenceItem> {
  const items: Array<EvidenceItem> = [];

  for (const session of sessions) {
    for (const message of session.messages) {
      if (message.text.trim().length > 0) {
        items.push(buildMessageEvidenceItem(session.id, message));
      }

      for (const part of message.parts) {
        const hasContent = (part.text && part.text.trim().length > 0) || part.title;
        if (hasContent) {
          items.push(buildPartEvidenceItem(session.id, message, part));
        }
      }
    }

    for (const tool of session.toolInvocations) {
      items.push(buildToolEvidenceItem(session.id, tool));
    }
  }

  return items;
}

export function buildEvidenceLookup(
  items: ReadonlyArray<EvidenceItem>,
): Map<string, EvidenceItem> {
  const lookup = new Map<string, EvidenceItem>();

  for (const item of items) {
    lookup.set(item.evidenceID, item);
  }

  return lookup;
}

export function buildEvidenceIDSet(
  items: ReadonlyArray<EvidenceItem>,
): Set<string> {
  return new Set(items.map((item) => item.evidenceID));
}

export type EvidenceSelectionOptions = {
  preferDirectUser?: boolean;
  maxItems?: number;
};

export function selectEvidenceForBudget(
  items: Array<EvidenceItem>,
  tokenBudget: number,
  options: EvidenceSelectionOptions = {},
): Array<EvidenceItem> {
  const { preferDirectUser = true, maxItems = 200 } = options;

  const seen = new Set<string>();
  const deduped: Array<EvidenceItem> = [];
  for (const item of items) {
    if (!seen.has(item.evidenceID)) {
      seen.add(item.evidenceID);
      deduped.push(item);
    }
  }

  const sorted = preferDirectUser
    ? [...deduped].sort((a, b) => {
        const aDirect = isDirectUserEvidence(a) ? 0 : 1;
        const bDirect = isDirectUserEvidence(b) ? 0 : 1;
        return aDirect - bDirect;
      })
    : deduped;

  const selected: Array<EvidenceItem> = [];
  let tokensUsed = 0;
  let count = 0;

  for (const item of sorted) {
    if (count >= maxItems) break;

    const itemTokens = estimateTokens(item.summaryText);
    if (tokensUsed + itemTokens > tokenBudget) continue;

    tokensUsed += itemTokens;
    selected.push(item);
    count++;
  }

  return selected;
}

export function isDirectUserEvidence(item: EvidenceItem): boolean {
  return (
    (item.citation.sourceType === "message" || item.citation.sourceType === "tool") &&
    !item.citation.partID
  );
}

export type EvidenceNoiseFilterConfig = {
  filterMode?: "off" | "structural" | "structural+density";
  minTextDensity?: number;
  maxNgramRepetition?: number;
  minLexicalDiversity?: number;
};

export type EvidenceFilterRemovedItem = {
  evidenceID: string;
  reason: "structural" | "low-density" | "high-repetition" | "low-diversity";
};

export type EvidenceFilterReport = {
  inputCount: number;
  outputCount: number;
  removedByStructural: number;
  removedByDensity: number;
  removedItems: Array<EvidenceFilterRemovedItem>;
};

export type EvidenceFilterResult = {
  items: Array<EvidenceItem>;
  report: EvidenceFilterReport;
};

const STRUCTURAL_NOISE_PATTERNS: Array<{ pattern: RegExp; source?: string }> = [
  { pattern: /^Base directory for this skill:/m, source: "claude" },
  { pattern: /<invocation\s+name="/i, source: "claude" },
  { pattern: /^---\n(?:name|description):/m, source: "claude" },
  { pattern: /^Skill:\s+\S+\n/im, source: "codex" },
  { pattern: /^\/[a-z][a-z0-9-]+\s/m, source: "codex" },
  { pattern: /^Tool:\s+skill\s/m, source: "opencode" },
  { pattern: /^---name:\s/m, source: "opencode" },
  { pattern: /^Use this skill when\s/im },
  { pattern: /^Skill:\s+\S/im },
];

function isStructuralNoise(text: string): boolean {
  return STRUCTURAL_NOISE_PATTERNS.some(({ pattern }) => pattern.test(text));
}

function extractWords(text: string): Array<string> {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

function computeLexicalDiversity(words: ReadonlyArray<string>): number {
  if (words.length === 0) return 0;
  const unique = new Set(words);
  return unique.size / words.length;
}

function computeNgramRepetitionRatio(words: ReadonlyArray<string>, n: number = 3): number {
  if (words.length < n) return 0;
  const ngrams = new Map<string, number>();
  for (let i = 0; i <= words.length - n; i++) {
    const ngram = words.slice(i, i + n).join(" ");
    ngrams.set(ngram, (ngrams.get(ngram) ?? 0) + 1);
  }
  let repeated = 0;
  for (const count of ngrams.values()) {
    if (count > 1) repeated += count;
  }
  const total = words.length - n + 1;
  return total > 0 ? repeated / total : 0;
}

function isLowDensity(
  text: string,
  minTextDensity: number,
  maxNgramRepetition: number,
  minLexicalDiversity: number,
): EvidenceFilterRemovedItem["reason"] | null {
  const words = extractWords(text);
  const wordCount = words.length;

  if (wordCount < minTextDensity) return "low-density";

  const ngramRatio = computeNgramRepetitionRatio(words);
  if (ngramRatio > maxNgramRepetition) return "high-repetition";

  const diversity = computeLexicalDiversity(words);
  if (diversity < minLexicalDiversity) return "low-diversity";

  return null;
}

export function filterEvidenceNoise(
  evidence: ReadonlyArray<EvidenceItem>,
  config?: EvidenceNoiseFilterConfig,
): EvidenceFilterResult {
  const mode = config?.filterMode ?? "off";

  if (mode === "off") {
    return {
      items: [...evidence],
      report: {
        inputCount: evidence.length,
        outputCount: evidence.length,
        removedByStructural: 0,
        removedByDensity: 0,
        removedItems: [],
      },
    };
  }

  const minTextDensity = config?.minTextDensity ?? 5;
  const maxNgramRepetition = config?.maxNgramRepetition ?? 0.5;
  const minLexicalDiversity = config?.minLexicalDiversity ?? 0.2;
  const applyDensity = mode === "structural+density";

  const kept: Array<EvidenceItem> = [];
  const removedItems: Array<EvidenceFilterRemovedItem> = [];
  let removedByStructural = 0;
  let removedByDensity = 0;

  for (const item of evidence) {
    if (isStructuralNoise(item.summaryText)) {
      removedItems.push({ evidenceID: item.evidenceID, reason: "structural" });
      removedByStructural++;
      continue;
    }

    if (applyDensity) {
      const densityReason = isLowDensity(
        item.summaryText,
        minTextDensity,
        maxNgramRepetition,
        minLexicalDiversity,
      );
      if (densityReason) {
        removedItems.push({ evidenceID: item.evidenceID, reason: densityReason });
        removedByDensity++;
        continue;
      }
    }

    kept.push(item);
  }

  return {
    items: kept,
    report: {
      inputCount: evidence.length,
      outputCount: kept.length,
      removedByStructural,
      removedByDensity,
      removedItems,
    },
  };
}
