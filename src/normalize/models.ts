export type EvidenceSourceType = "message" | "part" | "tool" | "summary" | "diff";

export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = Array<JsonValue>;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export const DEFAULT_PROMPT_SET_VERSION = "prompt-set/v1";

export type PromptSetVersion = `prompt-set/v${number}` | `prompt-set/${string}`;

export type EvidenceRef = {
  sessionID: string;
  messageID?: string;
  partID?: string;
  sourceType: EvidenceSourceType;
  excerpt?: string;
};

export type NormalizedPart = {
  id: string;
  type: string;
  text?: string;
  toolName?: string;
  status?: string;
  title?: string;
  files?: Array<string>;
  evidence: EvidenceRef;
};

export type ToolInvocation = {
  id: string;
  toolName: string;
  status: string;
  title?: string;
  input?: Record<string, unknown>;
  output?: string;
  startedAt?: number;
  endedAt?: number;
  evidence: EvidenceRef;
};

export type NormalizedMessage = {
  id: string;
  role: string;
  timestamp: number;
  text: string;
  parts: Array<NormalizedPart>;
  toolInvocations: Array<ToolInvocation>;
  evidence: EvidenceRef;
  agent?: string;
  modelID?: string;
  providerID?: string;
  cost?: number;
  tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } };
};

export type NormalizedDiffSummary = {
  filesChanged: number;
  additions: number;
  deletions: number;
  files: Array<string>;
};

export type WorkflowSignalKind =
  | "work-style"
  | "communication-style"
  | "validation-habit"
  | "constraint"
  | "token-efficiency"
  | "model-selection"
  | "delegation-pattern";

export type NormalizedStep = {
  id: string;
  startSnapshot?: string;
  endSnapshot?: string;
  duration?: number;
  cost?: number;
  tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } };
  reason?: string;
  evidence: EvidenceRef;
};

export type NormalizedSession = {
  id: string;
  title: string;
  directory: string;
  updatedAt: number;
  summaryText?: string;
  diffSummary?: NormalizedDiffSummary;
  messages: Array<NormalizedMessage>;
  toolInvocations: Array<ToolInvocation>;
  steps: Array<NormalizedStep>;
  parentID?: string;
  agent?: string;
  model?: import("./raw-session.js").RawSessionModel;
  cost?: number;
  tokens?: import("./raw-session.js").RawTokenUsage;
};

export type EvidenceItemSchemaVersion = "evidence-item/v1";
export type SkillEvaluationSchemaVersion = "skill-evaluation/v1";
export type LLMTraceSchemaVersion = "llm-trace/v1";

export type EvidenceCitation = EvidenceRef & {
  evidenceID: string;
};

export type EvidenceItem = {
  schemaVersion: EvidenceItemSchemaVersion;
  evidenceID: string;
  citation: EvidenceCitation;
  summaryText: string;
};

export type SkillGateStatus = "pass" | "fail";
export type SkillEvaluationVerdict = "pass" | "needs-patch" | "reject";
export type SkillEvaluationIssueSeverity = "low" | "medium" | "high";

export type SkillEvaluationIssue = {
  severity: SkillEvaluationIssueSeverity;
  message: string;
  location?: string;
};

export type SkillEvaluation = {
  schemaVersion: SkillEvaluationSchemaVersion;
  skillID: string;
  evaluatedAt: string;
  gates: {
    lint: SkillGateStatus;
    redaction: SkillGateStatus;
    grounding: SkillGateStatus;
    semanticPreservation?: SkillGateStatus;
  };
  scores: {
    grounding: number;
    actionability: number;
    specificity: number;
    safety: number;
    concision: number;
    discoverability: number;
    duplication?: number;
  };
  verdict: SkillEvaluationVerdict;
  issues: Array<SkillEvaluationIssue>;
};

export type LLMTraceStage =
  | "session-claims"
  | "category-claims"
  | "merge-claims"
  | "skill-plan"
  | "harness-analyst"
  | "harness-skeptic"
  | "harness-writer"
  | "harness-verifier";
export type LLMTraceMessageRole = "system" | "developer" | "user" | "assistant" | "tool";
export type LLMFinishReason = "stop" | "length" | "content-filter" | "tool-call" | "error" | "unknown";
export type LLMTraceWarningCode =
  | "provider-timeout"
  | "provider-malformed-output"
  | "provider-connection-error"
  | "provider-error";

export type LLMTraceMessage = {
  role: LLMTraceMessageRole;
  content: string;
};

export type LLMTraceWarning = {
  code: LLMTraceWarningCode;
  message: string;
};

export type LLMTraceCacheInfo = {
  hit: boolean;
  key: string;
  storedAt?: string;
};

export type LLMTrace = {
  schemaVersion: LLMTraceSchemaVersion;
  traceID: string;
  timestamp: string;
  promptSetVersion: PromptSetVersion;
  stage: LLMTraceStage;
  provider: string;
  model: string;
  inputArtifactRef?: string;
  cache?: LLMTraceCacheInfo;
  warnings?: Array<LLMTraceWarning>;
  request: {
    promptName: string;
    messages: Array<LLMTraceMessage>;
    parameters?: JsonObject;
  };
  response: {
    finishReason: LLMFinishReason;
    rawText?: string;
  };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};
