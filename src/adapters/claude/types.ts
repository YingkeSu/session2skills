// Claude Code JSONL transcript entry shapes. The format is append-only and
// evolves across versions, so all fields but `type` are optional and content is
// `unknown` until narrowed at parse time.

export type ClaudeTextBlock = {
  type: "text";
  text: string;
};

export type ClaudeThinkingBlock = {
  type: "thinking";
  thinking: string;
  signature?: string;
};

export type ClaudeToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ClaudeToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content?: unknown;
  is_error?: boolean;
};

export type ClaudeContentBlock =
  | ClaudeTextBlock
  | ClaudeThinkingBlock
  | ClaudeToolUseBlock
  | ClaudeToolResultBlock
  | { type: string; [key: string]: unknown };

export type ClaudeTranscriptEntry = {
  type: string;
  sessionId?: string;
  uuid?: string;
  parentUuid?: string | null;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  isSidechain?: boolean;
  version?: string;
  message?: {
    role?: string;
    content?: unknown;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  sourceToolUseID?: string;
  toolUseResult?: unknown;
};
