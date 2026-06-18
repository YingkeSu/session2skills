import type {
  NormalizedMessage,
  NormalizedPart,
  NormalizedSession,
  ToolInvocation,
} from "../normalize/models.js";
import { makeEvidenceID, makeExcerpt } from "../shared/evidence.js";
import { redactSecretsFromString } from "../shared/redaction.js";
import type { EvidenceRecord } from "./types.js";
import type { EvidenceStore } from "./store.js";

export type PersistResult = { written: number; skipped: number };

export function persistRawEvidence(
  sessions: ReadonlyArray<NormalizedSession>,
  store: EvidenceStore,
): PersistResult {
  const records: Array<EvidenceRecord> = [];
  let skipped = 0;

  for (const session of sessions) {
    for (const message of session.messages) {
      if (message.text.trim().length > 0) {
        records.push(buildMessageRecord(session.id, message));
      } else {
        skipped++;
      }

      for (const part of message.parts) {
        const hasContent =
          (part.text !== undefined && part.text.trim().length > 0) || part.title !== undefined;
        if (hasContent) {
          records.push(buildPartRecord(session.id, message, part));
        } else {
          skipped++;
        }
      }
    }

    for (const tool of session.toolInvocations) {
      records.push(buildToolRecord(session.id, tool));
    }
  }

  store.transaction(() => {
    for (const record of records) {
      store.put(record);
    }
  });

  return { written: records.length, skipped };
}

function buildMessageRecord(sessionID: string, message: NormalizedMessage): EvidenceRecord {
  return {
    evidenceID: makeEvidenceID(sessionID, message.id),
    sessionID,
    messageID: message.id,
    sourceType: "message",
    rawText: redactSecretsFromString(message.text),
    excerpt: makeExcerpt(message.text),
    redacted: true,
    createdAt: Date.now(),
  };
}

function buildPartRecord(
  sessionID: string,
  message: NormalizedMessage,
  part: NormalizedPart,
): EvidenceRecord {
  const sourceText = part.text ?? part.title ?? "";
  return {
    evidenceID: makeEvidenceID(sessionID, message.id, part.id),
    sessionID,
    messageID: message.id,
    partID: part.id,
    sourceType: part.toolName ? "tool" : "part",
    rawText: redactSecretsFromString(sourceText),
    excerpt: makeExcerpt(sourceText),
    redacted: true,
    createdAt: Date.now(),
  };
}

function buildToolRecord(sessionID: string, tool: ToolInvocation): EvidenceRecord {
  return {
    evidenceID: makeEvidenceID(sessionID, tool.id),
    sessionID,
    sourceType: "tool",
    rawText: buildToolRawText(tool),
    excerpt: makeExcerpt(buildToolExcerptComposite(tool)),
    redacted: true,
    createdAt: Date.now(),
  };
}

function toolHeader(tool: ToolInvocation): string {
  return tool.title ? `Tool: ${tool.toolName} — ${tool.title}` : `Tool: ${tool.toolName}`;
}

function buildToolExcerptComposite(tool: ToolInvocation): string {
  return [
    toolHeader(tool),
    tool.output ? makeExcerpt(tool.output) : "",
    tool.input ? makeExcerpt(JSON.stringify(tool.input)) : "",
  ].filter(Boolean).join("\n");
}

function buildToolRawText(tool: ToolInvocation): string {
  return [
    toolHeader(tool),
    tool.output ? redactSecretsFromString(tool.output) : "",
    tool.input ? redactSecretsFromString(JSON.stringify(tool.input)) : "",
  ].filter(Boolean).join("\n");
}
