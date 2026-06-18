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
};

export type GenerateRunRequest = {
  name?: string;
  recent?: number;
  workspace?: string;
  tone?: "concise" | "balanced" | "detailed";
  force?: boolean;
  template?: "claude-skill" | "opencode-skill" | "cursor-mdc" | "copilot-instructions";
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
  };
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

export type EvidenceDetail = {
  evidenceID: string;
  sourceType: string;
  excerpt: string;
};

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
