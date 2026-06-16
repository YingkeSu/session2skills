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

export type CodexRolloutItemPayload = Record<string, unknown>;

export type CodexRolloutItem = {
  type: string;
  payload: CodexRolloutItemPayload;
};

export type CodexRolloutLine = {
  timestamp: string;
  item: CodexRolloutItem;
};
