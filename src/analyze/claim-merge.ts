import type {
  CandidateClaim,
  EvidenceCitation,
  EvidenceItem,
  MergedClaim,
  MergedClaimSource,
  WorkflowSignalKind,
} from "../normalize/models.js";

import {
  DEFAULT_WORKFLOW_SIGNAL_TAXONOMY,
  validateClaim,
  type ValidatedClaim,
  type WorkflowSignalTaxonomy,
} from "./claim-validator.js";

const MERGED_CLAIM_SCHEMA_VERSION = "merged-claim/v1";

type ClaimSourceType = CandidateClaim["source"]["type"];

type MergeGroup = {
  dimension: WorkflowSignalKind;
  label: string;
  normalizedLabel: string;
  claimID: string;
  citations: Array<EvidenceCitation>;
  sources: Array<MergedClaimSource>;
  claims: Array<ValidatedClaim>;
  sourceClaimIDs: Array<string>;
  sourceTypes: Array<ClaimSourceType>;
  sessionIDs: Array<string>;
  ruleCount: number;
  llmCount: number;
  meanConfidence: number;
  evidenceCount: number;
  agreementBonus: number;
  sessionCoverageBonus: number;
  preContradictionConfidence: number;
};

export type MergedClaimConflict = {
  withClaimID: string;
  withLabel: string;
  normalizedLabel: string;
  penalty: number;
};

export type RankedMergedClaim = MergedClaim & {
  status: "accepted" | "tentative";
  normalizedLabel: string;
  evidenceCount: number;
  sessionIDs: Array<string>;
  sourceClaimIDs: Array<string>;
  sourceTypes: Array<ClaimSourceType>;
  agreementBonus: number;
  sessionCoverageBonus: number;
  contradictionPenalty: number;
  contradictions: Array<MergedClaimConflict>;
};

export type RejectedClaim = {
  status: "rejected";
  claimID: string;
  dimension: string;
  label: string;
  normalizedLabel: string;
  confidence: number;
  citations: Array<EvidenceCitation>;
  sourceClaimIDs: Array<string>;
  sourceTypes: Array<ClaimSourceType>;
  reasons: Array<string>;
  contradictions: Array<MergedClaimConflict>;
};

export type MergedClaimResult = {
  accepted: Array<RankedMergedClaim>;
  tentative: Array<RankedMergedClaim>;
  rejected: Array<RejectedClaim>;
};

export type MergeClaimsOptions = {
  taxonomy?: WorkflowSignalTaxonomy;
  agreementBonus?: number;
  contradictionPenalty?: number;
  sessionCoverageBonus?: number;
  acceptanceThreshold?: number;
  tentativeThreshold?: number;
};

const DEFAULT_OPTIONS = {
  agreementBonus: 0.12,
  contradictionPenalty: 0.18,
  sessionCoverageBonus: 0.04,
  acceptanceThreshold: 0.72,
  tentativeThreshold: 0.45,
} as const satisfies Required<Omit<MergeClaimsOptions, "taxonomy">>;

const CONTRADICTION_PAIRS: Readonly<Record<WorkflowSignalKind, ReadonlyArray<readonly [string, string]>>> = {
  "work-style": [
    ["analysis-first", "implementation-first"],
    ["iterative", "one-shot"],
  ],
  "communication-style": [
    ["concise", "explanatory"],
    ["consultative", "directive"],
  ],
  "validation-habit": [],
  constraint: [],
  "token-efficiency": [
    ["explorer", "implementer"],
  ],
  "model-selection": [
    ["cost-conscious", "quality-focused"],
  ],
  "delegation-pattern": [
    ["hands-on", "trusting"],
  ],
};

export function mergeClaims(
  ruleClaims: ReadonlyArray<CandidateClaim>,
  llmClaims: ReadonlyArray<CandidateClaim>,
  evidenceIndex: ReadonlyArray<EvidenceItem>,
  options: MergeClaimsOptions = {},
): MergedClaimResult {
  const resolved = {
    ...DEFAULT_OPTIONS,
    ...options,
    taxonomy: options.taxonomy ?? DEFAULT_WORKFLOW_SIGNAL_TAXONOMY,
  };

  const orderedClaims = [...ruleClaims, ...llmClaims].sort(compareCandidateClaims);
  const groupedClaims = new Map<string, Array<ValidatedClaim>>();
  const rejected: Array<RejectedClaim> = [];

  for (const claim of orderedClaims) {
    const validation = validateClaim(claim, evidenceIndex, resolved.taxonomy);
    if (!validation.valid) {
      rejected.push({
        status: "rejected",
        claimID: claim.claimID,
        dimension: String(claim.dimension ?? "unknown"),
        label: String(claim.label ?? "unknown"),
        normalizedLabel: normalizeRejectedLabel(claim.label),
        confidence: clamp01(claim.confidence),
        citations: sortCitations(claim.citations ?? []),
        sourceClaimIDs: isNonEmptyString(claim.claimID) ? [claim.claimID] : [],
        sourceTypes: isValidSourceType(claim.source?.type) ? [claim.source.type] : [],
        reasons: validation.errors.map((error) => `${error.field}: ${error.message}`),
        contradictions: [],
      });
      continue;
    }

    const key = `${validation.claim.dimension}:${validation.claim.normalizedLabel}`;
    const existing = groupedClaims.get(key) ?? [];
    existing.push(validation.claim);
    groupedClaims.set(key, existing);
  }

  const provisionalClaims = [...groupedClaims.values()]
    .map((claims) => buildMergeGroup(claims, resolved))
    .sort(compareGroups);

  const accepted: Array<RankedMergedClaim> = [];
  const tentative: Array<RankedMergedClaim> = [];

  for (const group of provisionalClaims) {
    const contradictions = collectContradictions(group, provisionalClaims, resolved);
    const contradictionPenalty = roundScore(
      Math.min(0.45, contradictions.reduce((sum, contradiction) => sum + contradiction.penalty, 0)),
    );
    const confidence = roundScore(
      clamp01(group.preContradictionConfidence - contradictionPenalty),
    );

    const mergedClaim: RankedMergedClaim = {
      schemaVersion: MERGED_CLAIM_SCHEMA_VERSION,
      claimID: group.claimID,
      dimension: group.dimension,
      label: group.label as RankedMergedClaim["label"],
      confidence,
      rationale: buildMergedRationale(group, contradictions),
      citations: group.citations,
      sources: group.sources,
      status: contradictions.length > 0 || confidence < resolved.acceptanceThreshold ? "tentative" : "accepted",
      normalizedLabel: group.normalizedLabel,
      evidenceCount: group.evidenceCount,
      sessionIDs: group.sessionIDs,
      sourceClaimIDs: group.sourceClaimIDs,
      sourceTypes: group.sourceTypes,
      agreementBonus: group.agreementBonus,
      sessionCoverageBonus: group.sessionCoverageBonus,
      contradictionPenalty,
      contradictions,
    };

    if (contradictions.length > 0) {
      tentative.push(mergedClaim);
      continue;
    }

    if (confidence >= resolved.acceptanceThreshold) {
      accepted.push(mergedClaim);
      continue;
    }

    if (confidence >= resolved.tentativeThreshold) {
      tentative.push(mergedClaim);
      continue;
    }

    rejected.push({
      status: "rejected",
      claimID: mergedClaim.claimID,
      dimension: mergedClaim.dimension,
      label: String(mergedClaim.label),
      normalizedLabel: mergedClaim.normalizedLabel,
      confidence: mergedClaim.confidence,
      citations: mergedClaim.citations,
      sourceClaimIDs: mergedClaim.sourceClaimIDs,
      sourceTypes: mergedClaim.sourceTypes,
      reasons: [
        `final confidence ${mergedClaim.confidence.toFixed(3)} is below tentative threshold ${resolved.tentativeThreshold.toFixed(3)}`,
      ],
      contradictions: mergedClaim.contradictions,
    });
  }

  return {
    accepted: accepted.sort(compareRankedClaims),
    tentative: tentative.sort(compareRankedClaims),
    rejected: rejected.sort(compareRejectedClaims),
  };
}

function buildMergeGroup(
  claims: Array<ValidatedClaim>,
  options: Required<MergeClaimsOptions> & { taxonomy: WorkflowSignalTaxonomy },
): MergeGroup {
  const sortedClaims = [...claims].sort(compareValidatedClaims);
  const firstClaim = sortedClaims[0]!;
  const citations = collectUniqueCitations(sortedClaims);
  const sessionIDs = [...new Set(citations.map((citation) => citation.sessionID))].sort();
  const sourceTypes = [...new Set(sortedClaims.map((claim) => claim.source.type))].sort();
  const ruleCount = sortedClaims.filter((claim) => claim.source.type === "rule").length;
  const llmCount = sortedClaims.length - ruleCount;
  const meanConfidence = roundScore(
    sortedClaims.reduce((sum, claim) => sum + claim.confidence, 0) / sortedClaims.length,
  );
  const evidenceCount = citations.length;
  const evidenceStrength = clamp01(evidenceCount / 4);
  const sessionStrength = clamp01(sessionIDs.length / 3);
  const sourceStrength = clamp01(sortedClaims.length / 3);
  const baseConfidence = clamp01(
    meanConfidence * 0.5 + evidenceStrength * 0.25 + sessionStrength * 0.15 + sourceStrength * 0.1,
  );
  const agreementBonus = ruleCount > 0 && llmCount > 0 ? options.agreementBonus : 0;
  const sessionCoverageBonus = roundScore(
    Math.min(0.12, Math.max(0, sessionIDs.length - 1) * options.sessionCoverageBonus),
  );

  return {
    dimension: firstClaim.dimension,
    label: firstClaim.label,
    normalizedLabel: firstClaim.normalizedLabel,
    claimID: makeMergedClaimID(firstClaim.dimension, firstClaim.normalizedLabel),
    citations,
    sources: sortedClaims.map((claim) => ({
      claimID: claim.claimID,
      dimension: claim.dimension,
      label: claim.label,
      confidence: claim.confidence,
      source: claim.source,
    })),
    claims: sortedClaims,
    sourceClaimIDs: sortedClaims.map((claim) => claim.claimID),
    sourceTypes,
    sessionIDs,
    ruleCount,
    llmCount,
    meanConfidence,
    evidenceCount,
    agreementBonus: roundScore(agreementBonus),
    sessionCoverageBonus,
    preContradictionConfidence: roundScore(
      clamp01(baseConfidence + agreementBonus + sessionCoverageBonus),
    ),
  };
}

function collectContradictions(
  group: MergeGroup,
  allGroups: Array<MergeGroup>,
  options: Required<MergeClaimsOptions> & { taxonomy: WorkflowSignalTaxonomy },
): Array<MergedClaimConflict> {
  return allGroups
    .filter((candidate) => candidate.claimID !== group.claimID)
    .filter((candidate) => labelsContradict(group.dimension, group.normalizedLabel, candidate.normalizedLabel))
    .map((candidate) => ({
      withClaimID: candidate.claimID,
      withLabel: candidate.label,
      normalizedLabel: candidate.normalizedLabel,
      penalty: roundScore(options.contradictionPenalty * contradictionStrength(candidate)),
    }))
    .sort((a, b) => a.withClaimID.localeCompare(b.withClaimID));
}

function contradictionStrength(group: MergeGroup): number {
  const evidenceStrength = clamp01(group.evidenceCount / 4);
  return clamp01(group.preContradictionConfidence * 0.7 + evidenceStrength * 0.3);
}

function labelsContradict(
  dimension: WorkflowSignalKind,
  left: string,
  right: string,
): boolean {
  return CONTRADICTION_PAIRS[dimension].some(([a, b]) => {
    const leftMatches = left === a && right === b;
    const rightMatches = left === b && right === a;
    return leftMatches || rightMatches;
  });
}

function collectUniqueCitations(claims: Array<ValidatedClaim>): Array<EvidenceCitation> {
  const citations = new Map<string, EvidenceCitation>();

  for (const claim of claims) {
    for (const citation of claim.citations) {
      citations.set(citation.evidenceID, citation);
    }
  }

  return [...citations.values()].sort((a, b) => a.evidenceID.localeCompare(b.evidenceID));
}

function buildMergedRationale(
  group: MergeGroup,
  contradictions: Array<MergedClaimConflict>,
): string {
  const sourceSummary = `${group.claims.length} supporting claim(s) (${group.ruleCount} rule, ${group.llmCount} llm) with ${group.evidenceCount} evidence citation(s) across ${group.sessionIDs.length} session(s).`;
  const agreementSummary = group.agreementBonus > 0
    ? "Rule and LLM agreement increased confidence."
    : "No cross-source agreement bonus applied.";
  const contradictionSummary = contradictions.length > 0
    ? `Contradictions surfaced with ${contradictions.map((item) => item.withLabel).join(", ")}, so confidence was reduced.`
    : "No contradictory label pair was detected.";

  return [sourceSummary, agreementSummary, contradictionSummary].join(" ");
}

function makeMergedClaimID(dimension: WorkflowSignalKind, normalizedLabel: string): string {
  return `merged:${dimension}:${normalizedLabel}`;
}

function normalizeRejectedLabel(label: unknown): string {
  if (typeof label !== "string") return "unknown";
  return label.trim().toLowerCase().replace(/\s+/g, "-");
}

function sortCitations(citations: Array<EvidenceCitation>): Array<EvidenceCitation> {
  return [...citations].sort((a, b) => a.evidenceID.localeCompare(b.evidenceID));
}

function compareCandidateClaims(left: CandidateClaim, right: CandidateClaim): number {
  return left.claimID.localeCompare(right.claimID);
}

function compareValidatedClaims(left: ValidatedClaim, right: ValidatedClaim): number {
  return left.claimID.localeCompare(right.claimID);
}

function compareGroups(left: MergeGroup, right: MergeGroup): number {
  if (left.dimension !== right.dimension) {
    return left.dimension.localeCompare(right.dimension);
  }

  return left.claimID.localeCompare(right.claimID);
}

function compareRankedClaims(left: RankedMergedClaim, right: RankedMergedClaim): number {
  if (right.confidence !== left.confidence) {
    return right.confidence - left.confidence;
  }

  if (left.dimension !== right.dimension) {
    return left.dimension.localeCompare(right.dimension);
  }

  return left.claimID.localeCompare(right.claimID);
}

function compareRejectedClaims(left: RejectedClaim, right: RejectedClaim): number {
  if (left.dimension !== right.dimension) {
    return left.dimension.localeCompare(right.dimension);
  }

  return left.claimID.localeCompare(right.claimID);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidSourceType(value: unknown): value is ClaimSourceType {
  return value === "rule" || value === "llm-session" || value === "llm-category";
}
