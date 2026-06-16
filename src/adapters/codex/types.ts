export type CodexThreadRow = {
  id: string;
  rollout_path: string;
  created_at: number;
  updated_at: number;
  source: string;
  model_provider: string;
  cwd: string;
  title: string;
  sandbox_policy: string;
  approval_mode: string;
  tokens_used: number;
  has_user_event: number;
  archived: number;
  archived_at: number | null;
  git_sha: string | null;
  git_branch: string | null;
  git_origin_url: string | null;
};

/**
 * One line of a Codex rollout `.jsonl` file.
 *
 * Real rollout files store `type` and `payload` at the TOP LEVEL of each line
 * (alongside `timestamp`), NOT nested under an `item` key. Verified against
 * `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`.
 *
 * Known top-level `type` values: `session_meta`, `event_msg`, `response_item`,
 * `turn_context`, `compacted`. `payload` is an arbitrary JSON object whose
 * shape depends on `type` (and often on `payload.type` for `event_msg` and
 * `response_item` lines).
 */
export type CodexRolloutLine = {
  timestamp: string;
  type: string;
  payload: Record<string, unknown>;
};
