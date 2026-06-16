import type { CodexThreadRow } from "../../src/adapters/codex/types.js";

export const CODEX_THREAD_ID = "cde_thread_001";
export const CODEX_SESSION_META_TS = "2026-05-01T10:00:00.000Z";
export const CODEX_USER_TS = "2026-05-01T10:00:05.000Z";
export const CODEX_ASSISTANT_TS = "2026-05-01T10:00:12.000Z";
export const CODEX_REASONING_TS = "2026-05-01T10:00:10.000Z";

// Every rollout line mirrors the REAL Codex JSONL shape verified against
// ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl: {timestamp, type, payload} at
// the TOP LEVEL (no `item` wrapper). payload.type disambiguates event/response
// subtypes.

export function makeSessionMetaLine(cwd = "/tmp/project"): string {
  return JSON.stringify({
    timestamp: CODEX_SESSION_META_TS,
    type: "session_meta",
    payload: {
      id: CODEX_THREAD_ID,
      cwd,
      originator: "Codex Desktop",
      cli_version: "0.137.0-alpha.4",
      source: "vscode",
      model_provider: "openai",
      timestamp: CODEX_SESSION_META_TS,
    },
  });
}

export function makeUserMessageLine(
  message: string,
  timestamp = CODEX_USER_TS,
): string {
  return JSON.stringify({
    timestamp,
    type: "event_msg",
    payload: {
      type: "user_message",
      message,
      images: [],
      local_images: [],
      text_elements: [],
    },
  });
}

export function makeAgentEventMessageLine(
  message: string,
  timestamp = CODEX_ASSISTANT_TS,
): string {
  return JSON.stringify({
    timestamp,
    type: "event_msg",
    payload: {
      type: "agent_message",
      message,
      phase: null,
      memory_citation: null,
    },
  });
}

export function makeAssistantMessageLine(
  text: string,
  timestamp = CODEX_ASSISTANT_TS,
  role = "assistant",
): string {
  return JSON.stringify({
    timestamp,
    type: "response_item",
    payload: {
      type: "message",
      role,
      content: [{ type: "output_text", text }],
    },
  });
}

export function makeReasoningLine(
  summaryText: string,
  timestamp = CODEX_REASONING_TS,
): string {
  return JSON.stringify({
    timestamp,
    type: "response_item",
    payload: {
      type: "reasoning",
      summary: [{ type: "summary_text", text: summaryText }],
      content: null,
      encrypted_content: null,
    },
  });
}

export function makeFunctionCallLine(
  timestamp = CODEX_ASSISTANT_TS,
): string {
  return JSON.stringify({
    timestamp,
    type: "response_item",
    payload: {
      type: "function_call",
      name: "shell",
      arguments: JSON.stringify({ cmd: ["ls", "-la"] }),
      call_id: "chatcmpl-tool-abc",
    },
  });
}

export function makeFunctionCallOutputLine(
  timestamp = CODEX_ASSISTANT_TS,
): string {
  return JSON.stringify({
    timestamp,
    type: "response_item",
    payload: {
      type: "function_call_output",
      call_id: "chatcmpl-tool-abc",
      output: "total 0",
    },
  });
}

export function makeUnknownItemLine(
  type = "compacted",
  timestamp = CODEX_ASSISTANT_TS,
): string {
  return JSON.stringify({
    timestamp,
    type,
    payload: { foo: "bar" },
  });
}

export function makeThreadRow(
  overrides: Partial<CodexThreadRow> = {},
): CodexThreadRow {
  return {
    id: CODEX_THREAD_ID,
    rollout_path: "/tmp/rollout-thread-001.jsonl",
    created_at: 1746093600,
    updated_at: 1746093612,
    source: "cli",
    model_provider: "openai",
    cwd: "/tmp/project",
    title: "Codex fixture thread",
    sandbox_policy: "workspace-write",
    approval_mode: "on-failure",
    tokens_used: 0,
    has_user_event: 1,
    archived: 0,
    archived_at: null,
    git_sha: null,
    git_branch: "main",
    git_origin_url: null,
    ...overrides,
  };
}
