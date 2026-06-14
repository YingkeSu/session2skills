/**
 * Harness-inspired LLM pipeline types.
 *
 * Four-stage pipeline: Analyst → Skeptic → Writer → Verifier.
 * Each stage reads from the previous stage's canonical artifact.
 */

import type {
  LLMTrace,
  WorkflowSignalKind,
} from "../normalize/models.js";

// ---------------------------------------------------------------------------
// Schema versions
// ---------------------------------------------------------------------------

export const CLAIM_MANIFEST_SCHEMA_VERSION = "claim-manifest/v1";
export const SKEPTIC_REPORT_SCHEMA_VERSION = "skeptic-report/v1";
export const VERIFIER_REPORT_SCHEMA_VERSION = "verifier-report/v1";

export type ClaimManifestSchemaVersion = typeof CLAIM_MANIFEST_SCHEMA_VERSION;
export type SkepticReportSchemaVersion = typeof SKEPTIC_REPORT_SCHEMA_VERSION;
export type VerifierReportSchemaVersion = typeof VERIFIER_REPORT_SCHEMA_VERSION;

// ---------------------------------------------------------------------------
// Stage 1: Claim Manifest (Analyst output)
// ---------------------------------------------------------------------------

export type ManifestClaim = {
  /** Unique claim identifier within this manifest. */
  id: string;
  /** Taxonomy dimension (all 7 supported). */
  dimension: WorkflowSignalKind;
  /** Canonical label from the dimension's taxonomy. */
  label: string;
  /** Confidence score 0–1. */
  confidence: number;
  /** Why the analyst believes this claim holds. */
  rationale: string;
  /** Evidence item IDs supporting this claim. */
  evidenceRefs: Array<string>;
};

/**
 * Verbatim evidence excerpt embedded in the manifest so the output directory
 * is self-contained for auditing. Excerpts are capped (see MAX_MANIFEST_EXCERPT_CHARS).
 */
export type ManifestEvidenceExcerpt = {
  /** Evidence item ID (matches a value in some claim's evidenceRefs). */
  evidenceID: string;
  /** Source type copied from the evidence citation (message | tool | part). */
  sourceType: string;
  /** Verbatim excerpt from the evidence item's summaryText. */
  excerpt: string;
};

export type ClaimManifest = {
  schemaVersion: ClaimManifestSchemaVersion;
  /** Claims extracted by the analyst. */
  claims: Array<ManifestClaim>;
  /** Free-text summary of the evidence corpus. */
  evidenceSummary: string;
  /** Dimensions that have at least one claim. */
  dimensionsCovered: Array<WorkflowSignalKind>;
  metadata: {
    generatedAt: string;
    sessionCount: number;
    totalEvidenceItems: number;
  };
  /**
   * Verbatim evidence excerpts for every evidenceID referenced by at least one
   * claim. Optional for backward compatibility; when present the manifest is
   * self-contained (no external files needed to audit claim evidenceRefs).
   */
  evidence?: Array<ManifestEvidenceExcerpt>;
};

// ---------------------------------------------------------------------------
// Stage 2: Skeptic Report
// ---------------------------------------------------------------------------

export type SkepticSeverity = "high" | "medium" | "low";

export type SkepticProblemType =
  | "unsupported"
  | "contradicted"
  | "overconfident"
  | "vague"
  | "duplicate";

export type SkepticIssue = {
  /** Claim ID that this issue references. */
  claimId: string;
  /** How serious is this issue. */
  severity: SkepticSeverity;
  /** What kind of problem was found. */
  problemType: SkepticProblemType;
  /** Human-readable explanation. */
  detail: string;
  /** Suggested fix. */
  suggestion: string;
};

export type SkepticReport = {
  schemaVersion: SkepticReportSchemaVersion;
  /** Issues found by the skeptic. */
  issues: Array<SkepticIssue>;
  /** Overall quality score 0–1 (1 = no issues). */
  overallScore: number;
  metadata: {
    generatedAt: string;
    claimCount: number;
    issueCount: number;
  };
};

// ---------------------------------------------------------------------------
// Stage 3: Writer Output
// ---------------------------------------------------------------------------

export type WriterDirective = {
  /** Human-readable directive text. */
  text: string;
  /** The manifest claim this directive was derived from. */
  sourceClaimId: string;
};

export type WriterSection = {
  /** Section heading. */
  title: string;
  /** Section summary prose. */
  summary: string;
  /** Directives for this section. */
  directives: Array<WriterDirective>;
  /** All claim IDs referenced in this section. */
  groundingClaimIds: Array<string>;
};

export type WriterOutput = {
  /** Rendered SKILL.md markdown. */
  skillMarkdown: string;
  /** Structured representation for verification. */
  sections: Array<WriterSection>;
};

// ---------------------------------------------------------------------------
// Stage 4: Verifier Report
// ---------------------------------------------------------------------------

export type VerifierItemStatus = "verified" | "unreferenced" | "fabricated";

export type VerifierCheckedItem = {
  /** The directive text checked. */
  directive: string;
  /** Manifest claim ID this directive maps to (null if none found). */
  claimId: string | null;
  /** Verification result. */
  status: VerifierItemStatus;
};

export type VerifierIssue = {
  /** What went wrong. */
  description: string;
  /** Where in the output (section title or directive index). */
  location: string;
  /** How serious. */
  severity: SkepticSeverity;
};

export type VerifierReport = {
  schemaVersion: VerifierReportSchemaVersion;
  /** Whether the SKILL.md passed verification. */
  pass: boolean;
  /** Per-directive check results. */
  checkedItems: Array<VerifierCheckedItem>;
  /** Issues found during verification. */
  issues: Array<VerifierIssue>;
  metadata: {
    generatedAt: string;
    directiveCount: number;
    verifiedCount: number;
    fabricatedCount: number;
  };
};

// ---------------------------------------------------------------------------
// Orchestrator result
// ---------------------------------------------------------------------------

export type HarnessBudget = {
  /** Per-stage request timeout. */
  timeoutMs: number;
  /** Generation temperature. */
  temperature: number;
  /** Max output tokens per stage. */
  maxOutputTokens: number;
};

export const DEFAULT_HARNESS_BUDGET: HarnessBudget = {
  timeoutMs: 120_000,
  temperature: 0.3,
  maxOutputTokens: 8192,
};

export type HarnessResult = {
  /** Stage 1: Claim manifest from evidence analyst. */
  manifest: ClaimManifest;
  /** Stage 2: Skeptic critique of the manifest. */
  skepticReport: SkepticReport;
  /** Stage 3: Writer output (SKILL.md + structured). */
  writerOutput: WriterOutput;
  /** Stage 4: Verifier cross-check result. */
  verifierReport: VerifierReport;
  /** LLM traces from all 4 stages. */
  traces: Array<LLMTrace>;
  /** Manifest after applying skeptic feedback. */
  revisedManifest: ClaimManifest;
};
