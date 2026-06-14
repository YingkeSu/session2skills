export type RunSummary = {
  name: string;
  model: string;
  generatedAt: string;
  verifierPassed: boolean;
  claimCount: number;
  skepticScore: number;
  skepticIssueCount: number;
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

export async function fetchRunDetail(name: string): Promise<RunDetail> {
  const res = await fetch(`/api/runs/${encodeURIComponent(name)}`);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch run detail: ${res.status} ${res.statusText}`
    );
  }
  return res.json();
}
