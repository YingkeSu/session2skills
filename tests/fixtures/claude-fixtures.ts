// Sample Claude Code JSONL transcript line builders for tests.
// Mirrors the real Claude Code transcript envelope shape.

import type { ClaudeTranscriptEntry } from "../../src/adapters/claude/types.js";

export function userTextLine(args: {
  sessionId?: string;
  uuid?: string;
  parentUuid?: string | null;
  timestamp?: string;
  cwd?: string;
  text: string;
}): ClaudeTranscriptEntry {
  return {
    type: "user",
    sessionId: args.sessionId ?? "sess-1",
    uuid: args.uuid ?? "u-1",
    parentUuid: args.parentUuid ?? null,
    timestamp: args.timestamp ?? "2026-05-20T14:30:00.000Z",
    cwd: args.cwd ?? "/Users/alice/my-project",
    gitBranch: "main",
    isSidechain: false,
    version: "2.1.140",
    message: {
      role: "user",
      content: args.text,
    },
  };
}

export function userToolResultLine(args: {
  sessionId?: string;
  uuid?: string;
  parentUuid?: string | null;
  timestamp?: string;
  toolUseId: string;
  resultText: string;
  isError?: boolean;
}): ClaudeTranscriptEntry {
  return {
    type: "user",
    sessionId: args.sessionId ?? "sess-1",
    uuid: args.uuid ?? "u-tool-result",
    parentUuid: args.parentUuid ?? null,
    timestamp: args.timestamp ?? "2026-05-20T14:30:05.000Z",
    sourceToolUseID: args.toolUseId,
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: args.toolUseId,
          content: args.resultText,
          is_error: args.isError === true ? true : undefined,
        },
      ],
    },
  };
}

export function assistantTextLine(args: {
  sessionId?: string;
  uuid?: string;
  parentUuid?: string | null;
  timestamp?: string;
  model?: string;
  text: string;
}): ClaudeTranscriptEntry {
  return {
    type: "assistant",
    sessionId: args.sessionId ?? "sess-1",
    uuid: args.uuid ?? "a-1",
    parentUuid: args.parentUuid ?? null,
    timestamp: args.timestamp ?? "2026-05-20T14:30:01.000Z",
    cwd: "/Users/alice/my-project",
    gitBranch: "main",
    isSidechain: false,
    version: "2.1.140",
    message: {
      role: "assistant",
      model: args.model ?? "claude-opus-4-7-20251202",
      content: [{ type: "text", text: args.text }],
      usage: { input_tokens: 100, output_tokens: 20 },
    },
  };
}

export function assistantRichLine(args: {
  sessionId?: string;
  uuid?: string;
  parentUuid?: string | null;
  timestamp?: string;
  text?: string;
  thinking?: string;
  toolUse?: { id: string; name: string; input?: Record<string, unknown> };
}): ClaudeTranscriptEntry {
  const content: Array<Record<string, unknown>> = [];
  if (args.text !== undefined) content.push({ type: "text", text: args.text });
  if (args.thinking !== undefined) {
    content.push({ type: "thinking", thinking: args.thinking, signature: "sig" });
  }
  if (args.toolUse !== undefined) {
    content.push({
      type: "tool_use",
      id: args.toolUse.id,
      name: args.toolUse.name,
      input: args.toolUse.input ?? {},
    });
  }
  return {
    type: "assistant",
    sessionId: args.sessionId ?? "sess-1",
    uuid: args.uuid ?? "a-rich",
    parentUuid: args.parentUuid ?? null,
    timestamp: args.timestamp ?? "2026-05-20T14:30:02.000Z",
    cwd: "/Users/alice/my-project",
    gitBranch: "main",
    isSidechain: false,
    version: "2.1.140",
    message: {
      role: "assistant",
      model: "claude-opus-4-7-20251202",
      content,
      usage: { input_tokens: 200, output_tokens: 40 },
    },
  };
}

export function unknownTypeLine(type = "future-event"): ClaudeTranscriptEntry {
  return {
    type,
    sessionId: "sess-1",
    uuid: "x-1",
    timestamp: "2026-05-20T14:30:03.000Z",
    payload: { whatever: true },
  } as ClaudeTranscriptEntry;
}

export function linesToJsonl(...entries: Array<ClaudeTranscriptEntry>): string {
  return entries.map((e) => JSON.stringify(e)).join("\n");
}
