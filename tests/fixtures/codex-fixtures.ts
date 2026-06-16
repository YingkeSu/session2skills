import type { CodexThreadRow } from "../../src/adapters/codex/types.js";

export const CODEX_THREAD_ID = "cde_thread_001";
export const CODEX_SESSION_META_TS = "2026-05-01T10:00:00.000Z";
export const CODEX_USER_TS = "2026-05-01T10:00:05.000Z";
export const CODEX_ASSISTANT_TS = "2026-05-01T10:00:12.000Z";

export function makeSessionMetaLine(cwd = "/tmp/project"): string {
  return JSON.stringify({
    timestamp: CODEX_SESSION_META_TS,
    item: {
      type: "session_meta",
      payload: {
        meta: {
          id: CODEX_THREAD_ID,
          cwd,
          source: "cli",
          model_provider: "openai",
          timestamp: CODEX_SESSION_META_TS,
          cli_version: "0.10.0",
          git: {
            commit_hash: "abc123",
            branch: "main",
            repository_url: "git@example.com:foo/bar.git",
          },
        },
      },
    },
  });
}

export function makeUserMessageLine(
  message: string,
  timestamp = CODEX_USER_TS,
): string {
  return JSON.stringify({
    timestamp,
    item: {
      type: "event_msg",
      payload: {
        type: "user_message",
        payload: { message },
      },
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
    item: {
      type: "response_item",
      payload: {
        type: "message",
        role,
        content: [{ type: "output_text", text }],
      },
    },
  });
}

export function makeUnknownItemLine(
  type = "compacted",
  timestamp = CODEX_ASSISTANT_TS,
): string {
  return JSON.stringify({
    timestamp,
    item: {
      type,
      payload: { foo: "bar" },
    },
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
