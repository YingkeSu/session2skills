import type {
  EvidenceItem,
  EvidenceItemSchemaVersion,
  NormalizedMessage,
  NormalizedPart,
  NormalizedSession,
  ToolInvocation,
  WorkflowSignalKind,
} from "../normalize/models.js";

export const EVIDENCE_ITEM_SCHEMA_VERSION: EvidenceItemSchemaVersion = "evidence-item/v1";

const MAX_EXCERPT_CHARS = 600;
const CHARS_PER_TOKEN = 4;

const CONSTRAINT_PATTERNS = [
  /(minimal diff|minimal changes|small diff|少改|尽量少改|最小.*修改)/i,
  /(preserve existing patterns|follow existing patterns|match existing patterns|保持现有模式|遵循现有模式|不要破坏现有结构)/i,
  /(type safety|strict types|avoid any|类型安全|严格类型|不要.*any)/i,
  /(avoid destructive|don't .*reset|不要破坏|不要删除测试|避免破坏性|不要强推)/i,
];

const CONSULTATIVE_PATTERN = /(\?|how|why|what|can you|could you|would you|是否|可行性|怎么|为什么|如何|能否|可以吗)/i;
const DIRECTIVE_PATTERN = /(implement|build|fix|add|generate|refactor|完成|实现|修复|添加|生成|重构|帮我)/i;

const DISCOVERY_TOOLS = new Set([
  "read", "grep", "glob", "task", "websearch_web_search_exa",
  "context7_resolve-library-id", "lsp_symbols", "lsp_goto_definition",
]);

const MODIFICATION_TOOLS = new Set([
  "apply_patch", "write", "edit", "ast_grep_replace",
]);

const VALIDATION_TOOLS = new Set([
  "pytest", "vitest", "jest", "npm run test", "pnpm test", "yarn test",
  "cargo test", "go test", "bun test", "lsp_diagnostics",
]);

const VALIDATION_COMMAND_PATTERN = /(typecheck|tsc --noEmit|lint|diagnostic|diagnostics|git status|git diff)/i;

export function makeEvidenceID(
  sessionID: string,
  messageID?: string,
  partID?: string,
): string {
  if (!messageID) return sessionID;
  if (!partID) return `${sessionID}:${messageID}`;
  return `${sessionID}:${messageID}:${partID}`;
}

export function makeExcerpt(text: string, maxChars = MAX_EXCERPT_CHARS): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const cutoff = trimmed.lastIndexOf(" ", maxChars - 3);
  const sliceEnd = cutoff > maxChars * 0.6 ? cutoff : maxChars - 3;
  return trimmed.slice(0, sliceEnd) + "...";
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function tagMessageDimensions(message: NormalizedMessage): WorkflowSignalKind[] {
  const dimensions = new Set<WorkflowSignalKind>();
  const text = message.text ?? "";

  if (message.role === "user" && text.trim().length > 0) {
    dimensions.add("communication-style");
    if (CONSTRAINT_PATTERNS.some((p) => p.test(text))) {
      dimensions.add("constraint");
    }
    if (CONSULTATIVE_PATTERN.test(text) || DIRECTIVE_PATTERN.test(text)) {
      dimensions.add("communication-style");
    }
  }

  return [...dimensions];
}

function tagToolDimensions(tool: ToolInvocation): WorkflowSignalKind[] {
  const dimensions = new Set<WorkflowSignalKind>();
  dimensions.add("work-style");

  if (DISCOVERY_TOOLS.has(tool.toolName) || MODIFICATION_TOOLS.has(tool.toolName)) {
    dimensions.add("work-style");
  }

  if (
    VALIDATION_TOOLS.has(tool.toolName) ||
    VALIDATION_COMMAND_PATTERN.test(tool.toolName) ||
    VALIDATION_COMMAND_PATTERN.test(tool.output ?? "") ||
    VALIDATION_COMMAND_PATTERN.test(JSON.stringify(tool.input ?? {}))
  ) {
    dimensions.add("validation-habit");
  }

  return [...dimensions];
}

function tagPartDimensions(part: NormalizedPart, parentMessage: NormalizedMessage): WorkflowSignalKind[] {
  const dimensions = new Set<WorkflowSignalKind>();

  if (parentMessage.role === "user") {
    dimensions.add("communication-style");
  }

  if (part.type === "tool-result" || part.toolName) {
    dimensions.add("work-style");

    if (VALIDATION_TOOLS.has(part.toolName ?? "") || VALIDATION_COMMAND_PATTERN.test(part.toolName ?? "")) {
      dimensions.add("validation-habit");
    }
  }

  const partText = part.text;
  if (partText && CONSTRAINT_PATTERNS.some((p) => p.test(partText))) {
    dimensions.add("constraint");
  }

  return [...dimensions];
}

function buildMessageEvidenceItem(
  sessionID: string,
  message: NormalizedMessage,
): EvidenceItem {
  const evidenceID = makeEvidenceID(sessionID, message.id);
  const excerpt = makeExcerpt(message.text);
  const dimensions = tagMessageDimensions(message);

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
    dimensions,
  };
}

function buildPartEvidenceItem(
  sessionID: string,
  message: NormalizedMessage,
  part: NormalizedPart,
): EvidenceItem {
  const evidenceID = makeEvidenceID(sessionID, message.id, part.id);
  const excerpt = makeExcerpt(part.text ?? part.title ?? "");
  const dimensions = tagPartDimensions(part, message);

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
    dimensions,
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
  const dimensions = tagToolDimensions(tool);

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
    dimensions,
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
  dimensions?: Array<WorkflowSignalKind>;
  preferDirectUser?: boolean;
  maxItems?: number;
};

export function selectEvidenceForBudget(
  items: Array<EvidenceItem>,
  tokenBudget: number,
  options: EvidenceSelectionOptions = {},
): Array<EvidenceItem> {
  const { dimensions, preferDirectUser = true, maxItems = 200 } = options;

  let filtered = items;
  if (dimensions && dimensions.length > 0) {
    const dimSet = new Set(dimensions);
    filtered = items.filter((item) =>
      item.dimensions.some((d) => dimSet.has(d)),
    );
  }

  const seen = new Set<string>();
  const deduped: Array<EvidenceItem> = [];
  for (const item of filtered) {
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

export function buildCategoryPacket(
  items: Array<EvidenceItem>,
  dimension: WorkflowSignalKind,
  tokenBudget: number,
): string {
  const selected = selectEvidenceForBudget(items, tokenBudget, {
    dimensions: [dimension],
    preferDirectUser: true,
  });

  if (selected.length === 0) {
    return `[No evidence for dimension: ${dimension}]`;
  }

  const header = `## Evidence for ${dimension} (${selected.length} items)`;
  const lines = selected.map((item) => {
    const source = isDirectUserEvidence(item) ? "user" : item.citation.sourceType;
    return `[${item.evidenceID}] (${source}) ${item.summaryText}`;
  });

  return [header, ...lines].join("\n");
}

export function isDirectUserEvidence(item: EvidenceItem): boolean {
  return (
    item.citation.sourceType === "message" &&
    !item.citation.partID
  );
}

export function groupByDimension(
  items: Array<EvidenceItem>,
): Record<WorkflowSignalKind, Array<EvidenceItem>> {
  const groups: Record<string, Array<EvidenceItem>> = {
    "work-style": [],
    "communication-style": [],
    "validation-habit": [],
    "constraint": [],
  };

  for (const item of items) {
    for (const dim of item.dimensions) {
      if (!groups[dim]) groups[dim] = [];
      groups[dim].push(item);
    }
  }

  return groups as Record<WorkflowSignalKind, Array<EvidenceItem>>;
}
