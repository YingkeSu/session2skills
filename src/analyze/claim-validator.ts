import type {
  CandidateClaim,
  EvidenceCitation,
  EvidenceItem,
  WorkflowSignalKind,
} from "../normalize/models.js";

import { buildEvidenceLookup } from "./evidence-index.js";

export type WorkflowSignalTaxonomy = Readonly<Record<WorkflowSignalKind, ReadonlyArray<string>>>;

export type ClaimValidationIssue = {
  field: string;
  message: string;
};

export type ValidatedClaim = CandidateClaim & {
  normalizedLabel: string;
  sessionIDs: Array<string>;
  evidenceCount: number;
};

export type ClaimValidationResult =
  | {
      valid: true;
      claim: ValidatedClaim;
    }
  | {
      valid: false;
      claim: CandidateClaim;
      errors: Array<ClaimValidationIssue>;
    };

export const DEFAULT_WORKFLOW_SIGNAL_TAXONOMY = {
  "work-style": [
    "analysis-first",
    "implementation-first",
    "iterative",
    "one-shot",
  ],
  "communication-style": [
    "concise",
    "explanatory",
    "consultative",
    "directive",
  ],
  "validation-habit": [
    "run-tests",
    "run-diagnostics",
    "check-git-state",
  ],
  constraint: [
    "minimal-diff",
    "preserve-patterns",
    "type-safety",
    "avoid-destructive-actions",
  ],
  "token-efficiency": [
    "explorer",
    "implementer",
    "analytical",
    "context-reuser",
  ],
  "model-selection": [
    "cost-conscious",
    "quality-focused",
    "adaptive",
  ],
  "delegation-pattern": [
    "hands-on",
    "trusting",
    "parallelizer",
  ],
} as const satisfies WorkflowSignalTaxonomy;

const VALID_DIMENSIONS = new Set<WorkflowSignalKind>([
  "work-style",
  "communication-style",
  "validation-habit",
  "constraint",
  "token-efficiency",
  "model-selection",
  "delegation-pattern",
]);

const VALID_SOURCE_TYPES = new Set(["rule", "llm-session", "llm-category"] as const);

export function normalizeClaimLabel(claim: Pick<CandidateClaim, "label"> | string): string {
  const rawLabel = typeof claim === "string" ? claim : claim.label;
  const trimmed = rawLabel.trim().toLowerCase();
  const customPrefix = trimmed.startsWith("custom:") ? "custom:" : "";
  const body = customPrefix ? trimmed.slice(customPrefix.length) : trimmed;

  const normalizedBody = body
    .replace(/["'`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${customPrefix}${normalizedBody}`;
}

export function validateClaim(
  claim: CandidateClaim,
  evidenceIndex: ReadonlyArray<EvidenceItem>,
  taxonomy: WorkflowSignalTaxonomy = DEFAULT_WORKFLOW_SIGNAL_TAXONOMY,
): ClaimValidationResult {
  const errors: Array<ClaimValidationIssue> = [];

  if (claim.schemaVersion !== "candidate-claim/v1") {
    errors.push({
      field: "schemaVersion",
      message: `expected \"candidate-claim/v1\", received \"${String(claim.schemaVersion)}\"`,
    });
  }

  if (!isNonEmptyString(claim.claimID)) {
    errors.push({ field: "claimID", message: "claimID must be a non-empty string" });
  }

  if (!isWorkflowSignalKind(claim.dimension)) {
    errors.push({
      field: "dimension",
      message: `invalid dimension \"${String(claim.dimension)}\"`,
    });
  }

  if (!isNonEmptyString(claim.label)) {
    errors.push({ field: "label", message: "label must be a non-empty string" });
  }

  if (!Number.isFinite(claim.confidence) || claim.confidence < 0 || claim.confidence > 1) {
    errors.push({
      field: "confidence",
      message: `confidence must be between 0 and 1, received ${String(claim.confidence)}`,
    });
  }

  if (!isNonEmptyString(claim.rationale)) {
    errors.push({ field: "rationale", message: "rationale must be a non-empty string" });
  }

  if (!Array.isArray(claim.citations) || claim.citations.length === 0) {
    errors.push({
      field: "citations",
      message: "citations must be a non-empty array of evidence citations",
    });
  }

  if (!claim.source || typeof claim.source !== "object") {
    errors.push({ field: "source", message: "source must be present" });
  } else if (!VALID_SOURCE_TYPES.has(claim.source.type)) {
    errors.push({
      field: "source.type",
      message: `invalid source type \"${String((claim.source as { type?: string }).type)}\"`,
    });
  }

  if (!isWorkflowSignalKind(claim.dimension) || !isNonEmptyString(claim.label)) {
    return { valid: false, claim, errors };
  }

  const canonicalLabel = resolveCanonicalLabel(claim.dimension, claim.label, taxonomy);
  if (!canonicalLabel) {
    errors.push({
      field: "label",
      message: `invalid label \"${claim.label}\" for dimension \"${claim.dimension}\"`,
    });
  }

  const evidenceLookup = buildEvidenceLookup(evidenceIndex);
  const citations = reconcileCitations(claim.citations, evidenceLookup);
  errors.push(...citations.errors);

  if (errors.length > 0 || !canonicalLabel) {
    return { valid: false, claim, errors };
  }

  const sessionIDs = [...new Set(citations.citations.map((citation) => citation.sessionID))].sort();

  return {
    valid: true,
    claim: {
      ...claim,
      label: canonicalLabel as CandidateClaim["label"],
      citations: citations.citations,
      normalizedLabel: normalizeClaimLabel(canonicalLabel),
      sessionIDs,
      evidenceCount: citations.citations.length,
    },
  };
}

function resolveCanonicalLabel(
  dimension: WorkflowSignalKind,
  label: string,
  taxonomy: WorkflowSignalTaxonomy,
): string | null {
  const normalizedLabel = normalizeClaimLabel(label);

  for (const candidate of taxonomy[dimension] ?? []) {
    if (normalizeClaimLabel(candidate) === normalizedLabel) {
      return candidate;
    }
  }

  return null;
}

function reconcileCitations(
  citations: Array<EvidenceCitation>,
  evidenceLookup: Map<string, EvidenceItem>,
): { citations: Array<EvidenceCitation>; errors: Array<ClaimValidationIssue> } {
  const errors: Array<ClaimValidationIssue> = [];
  const validCitations = new Map<string, EvidenceCitation>();

  for (const [index, citation] of citations.entries()) {
    if (!citation || typeof citation !== "object") {
      errors.push({
        field: `citations[${index}]`,
        message: "citation must be an object with an evidenceID",
      });
      continue;
    }

    if (!isNonEmptyString(citation.evidenceID)) {
      errors.push({
        field: `citations[${index}].evidenceID`,
        message: "evidenceID must be a non-empty string",
      });
      continue;
    }

    const evidenceItem = evidenceLookup.get(citation.evidenceID);
    if (!evidenceItem) {
      errors.push({
        field: `citations[${index}].evidenceID`,
        message: `unknown evidenceID \"${citation.evidenceID}\"`,
      });
      continue;
    }

    if (!matchesEvidenceCitation(citation, evidenceItem.citation)) {
      errors.push({
        field: `citations[${index}]`,
        message: `citation metadata for evidenceID \"${citation.evidenceID}\" does not match evidence index`,
      });
      continue;
    }

    validCitations.set(citation.evidenceID, evidenceItem.citation);
  }

  return {
    citations: [...validCitations.values()].sort((a, b) => a.evidenceID.localeCompare(b.evidenceID)),
    errors,
  };
}

function matchesEvidenceCitation(
  citation: EvidenceCitation,
  expected: EvidenceCitation,
): boolean {
  if (citation.sessionID !== expected.sessionID) return false;
  if (citation.sourceType !== expected.sourceType) return false;
  if (citation.messageID !== undefined && citation.messageID !== expected.messageID) return false;
  if (citation.partID !== undefined && citation.partID !== expected.partID) return false;
  return true;
}

function isWorkflowSignalKind(value: string): value is WorkflowSignalKind {
  return VALID_DIMENSIONS.has(value as WorkflowSignalKind);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
