export type EvidenceSourceType = "message" | "part" | "tool" | "summary" | "diff";

export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = Array<JsonValue>;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export const DEFAULT_PROMPT_SET_VERSION = "prompt-set/v1";
export const PROFILE_V2_SCHEMA_VERSION = "profile/v2";
export const RUN_MANIFEST_SCHEMA_VERSION = "run-manifest/v1";

export type PromptSetVersion = `prompt-set/v${number}` | `prompt-set/${string}`;
export type TaxonomyExtensionLabel = `custom:${string}`;

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

export type WorkStyleLabel =
  | "analysis-first"
  | "implementation-first"
  | "iterative"
  | "one-shot"
  | TaxonomyExtensionLabel;

export type CommunicationStyleLabel =
  | "concise"
  | "explanatory"
  | "consultative"
  | "directive"
  | TaxonomyExtensionLabel;

export type ValidationHabitLabel =
  | "run-tests"
  | "run-diagnostics"
  | "check-git-state"
  | TaxonomyExtensionLabel;

export type ConstraintLabel =
  | "minimal-diff"
  | "preserve-patterns"
  | "type-safety"
  | "avoid-destructive-actions"
  | TaxonomyExtensionLabel;

export type TokenEfficiencyLabel =
  | "explorer"
  | "implementer"
  | "analytical"
  | "context-reuser"
  | TaxonomyExtensionLabel;

export type ModelSelectionLabel =
  | "cost-conscious"
  | "quality-focused"
  | "adaptive"
  | TaxonomyExtensionLabel;

export type DelegationPatternLabel =
  | "hands-on"
  | "trusting"
  | "parallelizer"
  | TaxonomyExtensionLabel;

export type WorkflowSignalLabelMap = {
  "work-style": WorkStyleLabel;
  "communication-style": CommunicationStyleLabel;
  "validation-habit": ValidationHabitLabel;
  constraint: ConstraintLabel;
  "token-efficiency": TokenEfficiencyLabel;
  "model-selection": ModelSelectionLabel;
  "delegation-pattern": DelegationPatternLabel;
};

export type WorkflowSignalLabel = WorkflowSignalLabelMap[WorkflowSignalKind];

export type WorkflowSignal = {
  kind: WorkflowSignalKind;
  value: string;
  weight: number;
  evidence: Array<EvidenceRef>;
};

export type ProfileSignal<K extends WorkflowSignalKind = WorkflowSignalKind> = {
  kind: K;
  value: WorkflowSignalLabelMap[K];
  weight: number;
  evidence: Array<EvidenceRef>;
};

export type PreferenceProfile = {
  workStyle: Array<WorkflowSignal>;
  communicationStyle: Array<WorkflowSignal>;
  validationHabits: Array<WorkflowSignal>;
  constraints: Array<WorkflowSignal>;
  tokenEfficiency: Array<WorkflowSignal>;
  modelSelection: Array<WorkflowSignal>;
  delegationPattern: Array<WorkflowSignal>;
  confidenceNotes: Array<string>;
};

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

export type ProfileV2SchemaVersion = typeof PROFILE_V2_SCHEMA_VERSION;
export type RunManifestSchemaVersion = typeof RUN_MANIFEST_SCHEMA_VERSION;
export type EvidenceItemSchemaVersion = "evidence-item/v1";
export type CandidateClaimSchemaVersion = "candidate-claim/v1";
export type MergedClaimSchemaVersion = "merged-claim/v1";
export type SkillPlanSchemaVersion = "skill-plan/v1";
export type LLMTraceSchemaVersion = "llm-trace/v1";

export type ArtifactSchemaVersion =
  | "normalized-session/v1"
  | "preference-profile/v1"
  | ProfileV2SchemaVersion
  | EvidenceItemSchemaVersion
  | CandidateClaimSchemaVersion
  | MergedClaimSchemaVersion
  | SkillPlanSchemaVersion
  | LLMTraceSchemaVersion
  | RunManifestSchemaVersion
  | "claim-manifest/v1"
  | "skeptic-report/v1"
  | "verifier-report/v1";

export type EvidenceCitation = EvidenceRef & {
  evidenceID: string;
};

export type EvidenceItem = {
  schemaVersion: EvidenceItemSchemaVersion;
  evidenceID: string;
  citation: EvidenceCitation;
  summaryText: string;
  dimensions: Array<WorkflowSignalKind>;
};

export type CandidateClaimSource =
  | {
      type: "rule";
      ruleID: string;
    }
  | {
      type: "llm-session";
      traceID: string;
      promptSetVersion: PromptSetVersion;
      sessionID: string;
    }
  | {
      type: "llm-category";
      traceID: string;
      promptSetVersion: PromptSetVersion;
      dimension: WorkflowSignalKind;
    };

export type CandidateClaim<K extends WorkflowSignalKind = WorkflowSignalKind> = {
  schemaVersion: CandidateClaimSchemaVersion;
  claimID: string;
  dimension: K;
  label: WorkflowSignalLabelMap[K];
  confidence: number;
  rationale: string;
  citations: Array<EvidenceCitation>;
  source: CandidateClaimSource;
};

export type MergedClaimSource<K extends WorkflowSignalKind = WorkflowSignalKind> = {
  claimID: string;
  dimension: K;
  label: WorkflowSignalLabelMap[K];
  confidence: number;
  source: CandidateClaimSource;
};

export type MergedClaim<K extends WorkflowSignalKind = WorkflowSignalKind> = {
  schemaVersion: MergedClaimSchemaVersion;
  claimID: string;
  dimension: K;
  label: WorkflowSignalLabelMap[K];
  confidence: number;
  rationale: string;
  citations: Array<EvidenceCitation>;
  sources: Array<MergedClaimSource<K>>;
};

export type ProfileV2 = {
  schemaVersion: ProfileV2SchemaVersion;
  promptSetVersion: PromptSetVersion;
  workStyle: Array<ProfileSignal<"work-style">>;
  communicationStyle: Array<ProfileSignal<"communication-style">>;
  validationHabits: Array<ProfileSignal<"validation-habit">>;
  constraints: Array<ProfileSignal<"constraint">>;
  tokenEfficiency: Array<ProfileSignal<"token-efficiency">>;
  modelSelection: Array<ProfileSignal<"model-selection">>;
  delegationPattern: Array<ProfileSignal<"delegation-pattern">>;
  strongestSignals: Record<WorkflowSignalKind, Array<MergedClaim>>;
  acceptedClaims: Array<CandidateClaim>;
  tentativeClaims: Array<CandidateClaim>;
  unresolvedAreas: Array<string>;
  confidenceNotes: Array<string>;
  mergedClaims: Array<MergedClaim>;
};

export type SkillDirectivePlacement = "directive" | "summary-only";

export type SkillDirective = {
  id: string;
  directive: string;
  evidenceSummary: string;
  claimIDs: Array<string>;
  placement: SkillDirectivePlacement;
};

export type SkillPlanSectionID = WorkflowSignalKind | "summary" | TaxonomyExtensionLabel;

export type SkillPlanSection = {
  id: SkillPlanSectionID;
  title: string;
  summary: string;
  claimIDs: Array<string>;
};

export type SkillPlan = {
  schemaVersion: SkillPlanSchemaVersion;
  planID: string;
  promptSetVersion: PromptSetVersion;
  title: string;
  overview: string;
  sections: Array<SkillPlanSection>;
  directives: Record<string, Array<SkillDirective>>;
  fallbackDirectives: Record<string, Array<SkillDirective>>;
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

export type LLMStructuredOutput =
  | {
      kind: "candidate-claims";
      claims: Array<CandidateClaim>;
    }
  | {
      kind: "merged-claims";
      claims: Array<MergedClaim>;
    }
  | {
      kind: "skill-plan";
      plan: SkillPlan;
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
    structuredOutput?: LLMStructuredOutput;
  };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export type RunArtifactKind =
  | "normalized-sessions"
  | "profile"
  | "evidence-index"
  | "rule-claims"
  | "llm-session-claims"
  | "llm-category-claims"
  | "merged-claims"
  | "skill-plan"
  | "llm-traces"
  | "claim-manifest"
  | "skeptic-report"
  | "verifier-report";

export type RunArtifact = {
  kind: RunArtifactKind;
  fileName: string;
  schemaVersion: ArtifactSchemaVersion;
  promptSetVersion?: PromptSetVersion;
};

export type RunManifest = {
  schemaVersion: RunManifestSchemaVersion;
  runID: string;
  generatedAt: string;
  directory: string;
  sessionIDs: Array<string>;
  promptSetVersion: PromptSetVersion;
  artifacts: Array<RunArtifact>;
  metadata?: {
    mode?: "legacy" | "hybrid" | "harness";
    tone?: string;
    llm?: {
      provider: string;
      model: string;
      version?: string;
    };
    promptVersions?: Record<string, string | Array<string>>;
    schemaVersions?: Record<string, string>;
    skillRenderMode?: "llm" | "fallback";
  };
};
