export type GenerationStage =
  | "analyst"
  | "skeptic"
  | "writer"
  | "verifier"
  | "done"
  | "error"
  | "no-claims"
  | "interrupted"
  | "idle";

export type RunSummary = {
  name: string;
  model: string;
  generatedAt: string;
  verifierPassed: boolean;
  claimCount: number;
  skepticScore: number;
  skepticIssueCount: number;
  artifactStatus?: "complete" | "partial" | "legacy";
  skillAvailable?: boolean;
  summaryAvailable?: boolean;
  progressStage?: GenerationStage;
  /** Skill-run management fields, sourced from `.skill-meta.json`. */
  group?: string | null;
  archived?: boolean;
  archivedAt?: string | null;
  updatedAt?: string;
};

export type GenerateRunRequest = {
  name?: string;
  recent?: number;
  sessionSelections?: Array<{ adapter: string; sessionId: string }>;
  workspace?: string;
  directory?: string;
  tone?: "concise" | "balanced" | "detailed";
  force?: boolean;
  template?: "claude-skill" | "opencode-skill" | "cursor-mdc" | "copilot-instructions";
  skillType?: "workflow" | "testing" | "code-style" | "debugging" | "review";
  evidenceConfig?: {
    tokenBudget?: number;
    maxChars?: number;
    maxItems?: number;
  };
  /**
   * Per-run LLM provider/model override. Mirrors the backend LlmRunConfig.
   * Sensitive empty fields (e.g. an unset API key) are omitted by the caller.
   */
  llmConfig?: LlmRunConfig;
};

/**
 * Serializable LLM selection forwarded to the server. Mirrors the backend
 * `LlmRunConfig` contract in `src/llm/selection.ts`.
 */
export type LlmRunConfig = {
  provider?: string;
  baseUrl?: string;
  model?: string;
  modelVersion?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  path?: string;
  preferJsonObject?: boolean;
};

export type DiscoveredProject = {
  adapter: string;
  encodedDir: string;
  projectPath: string;
  sessionCount: number;
  lastModified: string;
  configDir: string;
};

export type GenerationProgress = {
  stage: GenerationStage;
  completedStages: GenerationStage[];
  startedAt?: string;
  updatedAt?: string;
  error?: string;
};

export type AsyncRunResponse = {
  name: string;
  status: "running";
};

export type SkillGateStatus = "pass" | "fail";

export type SkillEvaluation = {
  schemaVersion: string;
  skillID: string;
  evaluatedAt: string;
  gates: {
    lint: SkillGateStatus;
    redaction: SkillGateStatus;
    grounding: SkillGateStatus;
  };
  scores: {
    grounding: number;
    actionability: number;
    specificity: number;
    safety: number;
    concision: number;
    discoverability: number;
    skepticQuality?: number;
    evidenceRichness?: number;
  };
  composite?: number;
  grade?: "A" | "B" | "C" | "D" | "F";
  verdict: "pass" | "needs-patch" | "reject";
  issues: Array<{
    severity: "high" | "medium" | "low";
    message: string;
    location: string;
  }>;
};

export type ManifestEvidenceExcerpt = {
  evidenceID: string;
  sourceType: string;
  excerpt: string;
};

export type ManifestClaim = {
  id: string;
  dimension: string;
  label: string;
  confidence: number;
  rationale: string;
  evidenceRefs: Array<string>;
};

export type ClaimManifest = {
  schemaVersion: string;
  claims: Array<ManifestClaim>;
  evidenceSummary: string;
  dimensionsCovered: Array<string>;
  metadata: {
    generatedAt: string;
    sessionCount: number;
    totalEvidenceItems: number;
  };
  evidence?: Array<ManifestEvidenceExcerpt>;
};

export type SkepticIssue = {
  claimId: string;
  severity: "high" | "medium" | "low";
  problemType: string;
  detail: string;
  suggestion: string;
};

export type SkepticReport = {
  schemaVersion: string;
  issues: Array<SkepticIssue>;
  overallScore: number;
  metadata: {
    generatedAt: string;
    claimCount: number;
    issueCount: number;
  };
};

export type VerifierItemStatus = "verified" | "unreferenced" | "fabricated";

export type VerifierCheckedItem = {
  directive: string;
  claimId: string | null;
  status: VerifierItemStatus;
};

export type VerifierIssue = {
  description: string;
  location: string;
  severity: "high" | "medium" | "low";
};

export type VerifierReport = {
  schemaVersion: string;
  pass: boolean;
  checkedItems: Array<VerifierCheckedItem>;
  issues: Array<VerifierIssue>;
  metadata: {
    generatedAt: string;
    directiveCount: number;
    verifiedCount: number;
    fabricatedCount: number;
  };
};

export type LLMTraceSummary = {
  stage: string;
  model: string;
  provider: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs?: number;
  finishReason?: string;
  promptName?: string;
  requestPromptName?: string;
};

export type RunDetail = {
  name: string;
  claimManifest: ClaimManifest | null;
  skepticReport: SkepticReport | null;
  verifierReport: VerifierReport | null;
  writerSections: Record<string, unknown> | null;
  skillMarkdown: string | null;
  traces: Array<Record<string, unknown>>;
};

export async function fetchRuns(): Promise<RunSummary[]> {
  const res = await fetch("/api/runs");
  if (!res.ok) {
    throw new Error(`Failed to fetch runs: ${res.status}`);
  }
  return res.json();
}

export async function createRun(request: GenerateRunRequest): Promise<RunSummary> {
  const res = await fetch("/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    throw new Error(`Failed to generate run: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function createRunAsync(request: GenerateRunRequest): Promise<AsyncRunResponse> {
  const res = await fetch("/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...request, async: true }),
  });
  if (!res.ok) {
    throw new Error(`Failed to generate run: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchGenerationProgress(runName: string): Promise<GenerationProgress> {
  const res = await fetch(`/api/runs/${encodeURIComponent(runName)}/progress`);
  if (!res.ok) {
    throw new Error(`Failed to fetch progress: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export type EvidenceDetail = {
  evidenceID: string;
  sourceType: string;
  excerpt: string;
};

export type SessionMeta = {
  providerId: string;
  sessionId: string;
  title: string | null;
  sourceType: string;
  sourcePath: string | null;
  updatedAt: number | null;
  messageCount: number | null;
};

export type AdapterInfo = {
  type: string;
  available: boolean;
  sourceType?: string;
  sourcePath?: string | null;
};

export type AdapterError = {
  adapter: string;
  error: string;
};

export type SessionsResult = {
  sessions: SessionMeta[];
  adapterErrors: AdapterError[];
};

export async function fetchAdapters(): Promise<AdapterInfo[]> {
  const res = await fetch("/api/adapters");
  if (!res.ok) {
    throw new Error(`Failed to fetch adapters: ${res.status}`);
  }
  return res.json();
}

export async function fetchSessions(
  adapter: string,
  directory: string,
): Promise<SessionsResult> {
  const params = new URLSearchParams({ adapter, directory, recent: "50" });
  const res = await fetch(`/api/sessions?${params}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch sessions: ${res.status}`);
  }
  const sessions = (await res.json()) as SessionMeta[];
  const errorHeader = res.headers.get("X-Adapter-Errors");
  const adapterErrors: AdapterError[] = errorHeader
    ? (JSON.parse(errorHeader) as AdapterError[])
    : [];
  return { sessions, adapterErrors };
}

export async function fetchProjects(adapter: string): Promise<DiscoveredProject[]> {
  const res = await fetch(`/api/projects?adapter=${encodeURIComponent(adapter)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch projects: ${res.status}`);
  }
  return res.json();
}

export async function fetchRunDetail(name: string): Promise<RunDetail> {
  const res = await fetch(`/api/runs/${encodeURIComponent(name)}`);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch run detail: ${res.status} ${res.statusText}`
    );
  }
  return res.json();
}

export async function evaluateRun(name: string): Promise<SkillEvaluation> {
  const res = await fetch(`/api/runs/${encodeURIComponent(name)}/evaluate`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(
      `Failed to evaluate run: ${res.status} ${res.statusText}`
    );
  }
  const data = await res.json();
  return data.evaluation;
}

export async function fetchEvidenceDetail(
  runName: string,
  evidenceId: string
): Promise<EvidenceDetail> {
  const res = await fetch(
    `/api/runs/${encodeURIComponent(runName)}/evidence/${encodeURIComponent(evidenceId)}`
  );
  if (!res.ok) {
    throw new Error(
      `Failed to fetch evidence detail: ${res.status} ${res.statusText}`
    );
  }
  return res.json();
}
