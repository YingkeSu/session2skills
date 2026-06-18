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
    item.citation.sourceType === "message" &&
    !item.citation.partID
  );
}
