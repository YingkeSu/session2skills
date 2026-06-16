import { readFileSync } from "node:fs";

import type {
  RawMessage,
  RawMessageInfo,
  RawPart,
  RawSessionMessages,
} from "../../normalize/raw-session.js";
import { OpenCodeAdapterError, toErrorMessage } from "../../shared/errors.js";
import type {
  ClaudeContentBlock,
  ClaudeTextBlock,
  ClaudeThinkingBlock,
  ClaudeToolResultBlock,
  ClaudeToolUseBlock,
  ClaudeTranscriptEntry,
} from "./types.js";

export type TranscriptMeta = {
  cwd?: string;
  model?: string;
  firstTimestamp?: number;
  lastTimestamp?: number;
  firstPrompt?: string;
};

export type ParsedTranscript = {
  messages: RawSessionMessages;
  meta: TranscriptMeta;
};

export function parseTranscriptFile(filePath: string): ParsedTranscript {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new OpenCodeAdapterError(
      `Failed to read Claude transcript ${filePath}: ${toErrorMessage(error)}`,
      { cause: error },
    );
  }

  const entries = parseEntries(raw);
  return {
    messages: buildMessages(entries),
    meta: extractMeta(entries),
  };
}

export function parseEntries(raw: string): Array<ClaudeTranscriptEntry> {
  const out: Array<ClaudeTranscriptEntry> = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const entry = coerceEntry(value);
    if (entry) out.push(entry);
  }
  return out;
}

export function extractMeta(entries: Array<ClaudeTranscriptEntry>): TranscriptMeta {
  let cwd: string | undefined;
  let model: string | undefined;
  let firstTimestamp: number | undefined;
  let lastTimestamp: number | undefined;
  let firstPrompt: string | undefined;

  for (const entry of entries) {
    if (cwd === undefined && typeof entry.cwd === "string") {
      cwd = entry.cwd;
    }

    const ts = parseTimestamp(entry.timestamp);
    if (ts !== undefined) {
      if (firstTimestamp === undefined) firstTimestamp = ts;
      lastTimestamp = ts;
    }

    if (
      entry.type === "assistant" &&
      model === undefined &&
      typeof entry.message?.model === "string"
    ) {
      model = entry.message.model;
    }

    if (firstPrompt === undefined && entry.type === "user") {
      firstPrompt = firstUserText(entry);
    }
  }

  return { cwd, model, firstTimestamp, lastTimestamp, firstPrompt };
}

function buildMessages(entries: Array<ClaudeTranscriptEntry>): RawSessionMessages {
  const toolOutputs = collectToolOutputs(entries);
  const messages: RawSessionMessages = [];

  entries.forEach((entry, lineIndex) => {
    if (entry.type === "user") {
      const content = entry.message?.content;
      if (typeof content === "string") {
        messages.push(makeMessage(entry, lineIndex, [
          makePart(entry, lineIndex, 0, "text", { text: content }),
        ]));
      } else if (Array.isArray(content)) {
        const parts: Array<RawPart> = [];
        for (const raw of content as unknown[]) {
          const block = coerceBlock(raw);
          if (block && isTextBlock(block)) {
            parts.push(makePart(entry, lineIndex, parts.length, "text", { text: block.text }));
          }
        }
        if (parts.length > 0) {
          messages.push(makeMessage(entry, lineIndex, parts));
        }
      }
    } else if (entry.type === "assistant") {
      const parts = buildAssistantParts(entry, lineIndex, toolOutputs);
      if (parts.length > 0) {
        messages.push(makeMessage(entry, lineIndex, parts));
      }
    }
  });

  return messages;
}

type ToolOutput = { output: string; isError: boolean };

function collectToolOutputs(entries: Array<ClaudeTranscriptEntry>): Map<string, ToolOutput> {
  const map = new Map<string, ToolOutput>();
  for (const entry of entries) {
    if (entry.type !== "user") continue;
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    for (const raw of content as unknown[]) {
      const block = coerceBlock(raw);
      if (block && isToolResultBlock(block)) {
        map.set(block.tool_use_id, {
          output: extractToolResultText(block.content, entry.toolUseResult),
          isError: block.is_error === true,
        });
      }
    }
  }
  return map;
}

function buildAssistantParts(
  entry: ClaudeTranscriptEntry,
  lineIndex: number,
  toolOutputs: Map<string, ToolOutput>,
): Array<RawPart> {
  const parts: Array<RawPart> = [];
  const content = entry.message?.content;

  const appendBlock = (block: ClaudeContentBlock): void => {
    if (isTextBlock(block)) {
      parts.push(makePart(entry, lineIndex, parts.length, "text", { text: block.text }));
    } else if (isThinkingBlock(block)) {
      parts.push(makePart(entry, lineIndex, parts.length, "reasoning", { text: block.thinking }));
    } else if (isToolUseBlock(block)) {
      const out = toolOutputs.get(block.id);
      parts.push(
        makePart(entry, lineIndex, parts.length, "tool", {
          tool: block.name,
          callID: block.id,
          state: {
            status: out?.isError ? "error" : "completed",
            input: block.input,
            output: out?.output ?? "",
            error: out?.isError ? out.output : undefined,
          },
        }),
      );
    }
  };

  if (typeof content === "string") {
    appendBlock({ type: "text", text: content });
  } else if (Array.isArray(content)) {
    for (const raw of content as unknown[]) {
      const block = coerceBlock(raw);
      if (block) appendBlock(block);
    }
  }

  return parts;
}

function makeMessage(
  entry: ClaudeTranscriptEntry,
  lineIndex: number,
  parts: Array<RawPart>,
): RawMessage {
  const sessionId = resolveSessionId(entry, lineIndex);
  const modelID = typeof entry.message?.model === "string" ? entry.message.model : undefined;

  const info: RawMessageInfo = {
    id: messageId(sessionId, lineIndex),
    sessionID: sessionId,
    role: entry.type === "assistant" ? "assistant" : "user",
    createdAt: parseTimestamp(entry.timestamp) ?? 0,
    modelID,
    providerID: modelID !== undefined ? "anthropic" : undefined,
  };

  return { info, parts };
}

type PartFields = Partial<Omit<RawPart, "id" | "sessionID" | "messageID" | "type">>;

function makePart(
  entry: ClaudeTranscriptEntry,
  lineIndex: number,
  partIndex: number,
  type: string,
  fields: PartFields,
): RawPart {
  const sessionId = resolveSessionId(entry, lineIndex);
  const mid = messageId(sessionId, lineIndex);
  return {
    id: `${mid}:${partIndex}`,
    sessionID: sessionId,
    messageID: mid,
    type,
    ...fields,
  };
}

function resolveSessionId(entry: ClaudeTranscriptEntry, lineIndex: number): string {
  if (typeof entry.sessionId === "string" && entry.sessionId.length > 0) {
    return entry.sessionId;
  }
  return `session-${lineIndex}`;
}

function messageId(sessionId: string, lineIndex: number): string {
  return `${sessionId}:${lineIndex}`;
}

function firstUserText(entry: ClaudeTranscriptEntry): string | undefined {
  const content = entry.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    for (const raw of content as unknown[]) {
      const block = coerceBlock(raw);
      if (block && isTextBlock(block)) return block.text;
    }
  }
  return undefined;
}

function extractToolResultText(content: unknown, fallback: unknown): string {
  const fromContent = stringifyContent(content);
  return fromContent !== "" ? fromContent : stringifyContent(fallback);
}

function stringifyContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: Array<string> = [];
    for (const item of content as unknown[]) {
      if (typeof item === "string") {
        parts.push(item);
      } else if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        if (obj.type === "text" && typeof obj.text === "string") {
          parts.push(obj.text);
        }
      }
    }
    return parts.join("\n");
  }
  return "";
}

function parseTimestamp(ts: unknown): number | undefined {
  if (typeof ts !== "string") return undefined;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? undefined : ms;
}

function coerceEntry(value: unknown): ClaudeTranscriptEntry | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const obj = value as Record<string, unknown>;
  if (typeof obj.type !== "string") return undefined;
  return obj as unknown as ClaudeTranscriptEntry;
}

function coerceBlock(value: unknown): ClaudeContentBlock | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const obj = value as Record<string, unknown>;
  if (typeof obj.type !== "string") return undefined;
  return obj as unknown as ClaudeContentBlock;
}

function fieldString(block: ClaudeContentBlock, key: string): string | undefined {
  const value = (block as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function isTextBlock(block: ClaudeContentBlock): block is ClaudeTextBlock {
  return block.type === "text" && fieldString(block, "text") !== undefined;
}

function isThinkingBlock(block: ClaudeContentBlock): block is ClaudeThinkingBlock {
  return block.type === "thinking" && fieldString(block, "thinking") !== undefined;
}

function isToolUseBlock(block: ClaudeContentBlock): block is ClaudeToolUseBlock {
  return (
    block.type === "tool_use" &&
    fieldString(block, "id") !== undefined &&
    fieldString(block, "name") !== undefined
  );
}

function isToolResultBlock(block: ClaudeContentBlock): block is ClaudeToolResultBlock {
  return block.type === "tool_result" && fieldString(block, "tool_use_id") !== undefined;
}
