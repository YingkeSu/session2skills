import type {
  CandidateClaim,
  CandidateClaimSchemaVersion,
  EvidenceCitation,
  EvidenceRef,
  NormalizedMessage,
  NormalizedSession,
  WorkflowSignal,
  WorkflowSignalKind,
  WorkflowSignalLabel,
  WorkflowSignalLabelMap,
} from "../normalize/models.js";

const CANDIDATE_CLAIM_SCHEMA_VERSION: CandidateClaimSchemaVersion = "candidate-claim/v1";

let claimCounter = 0;

function nextClaimID(extractorID: string): string {
  claimCounter += 1;
  return `claim:${extractorID}:${claimCounter}`;
}

/** Reset claim counter (useful for deterministic tests). */
export function resetClaimCounter(): void {
  claimCounter = 0;
}

export function createSignal(
  kind: WorkflowSignalKind,
  value: string,
  evidence: Array<EvidenceRef>,
  weight = evidence.length,
): WorkflowSignal {
  return {
    kind,
    value,
    weight,
    evidence,
  };
}

/**
 * Build a CandidateClaim from rule-extractor output.
 *
 * @param extractorID - Stable identifier for the rule extractor (e.g. "extract-work-style").
 * @param ruleID      - Specific rule within the extractor (e.g. "analysis-first").
 * @param dimension   - WorkflowSignalKind dimension.
 * @param label       - Typed label for the claim.
 * @param confidence  - 0-1 confidence based on evidence strength.
 * @param rationale   - Human-readable explanation of why this claim was produced.
 * @param citations   - Evidence citations with evidenceIDs.
 */
export function createRuleClaim<K extends WorkflowSignalKind>(
  extractorID: string,
  ruleID: string,
  dimension: K,
  label: WorkflowSignalLabelMap[K],
  confidence: number,
  rationale: string,
  citations: Array<EvidenceCitation>,
): CandidateClaim<K> {
  return {
    schemaVersion: CANDIDATE_CLAIM_SCHEMA_VERSION,
    claimID: nextClaimID(extractorID),
    dimension,
    label,
    confidence,
    rationale,
    citations,
    source: { type: "rule", ruleID: `${extractorID}/${ruleID}` },
  };
}

/**
 * Convert raw EvidenceRef[] into EvidenceCitation[] with generated evidenceIDs.
 * Uses a stable format: `ev:<sourceType>:<sessionID>:<messageID?>:<partID?>`.
 */
export function toCitations(evidence: Array<EvidenceRef>): Array<EvidenceCitation> {
  return dedupeEvidence(evidence).map((ref) => ({
    ...ref,
    evidenceID: `ev:${ref.sourceType}:${ref.sessionID}:${ref.messageID ?? ""}:${ref.partID ?? ""}`,
  }));
}

export function getUserMessages(sessions: Array<NormalizedSession>): Array<NormalizedMessage> {
  return sessions.flatMap((session) => session.messages.filter((message) => message.role === "user"));
}

export function dedupeEvidence(evidence: Array<EvidenceRef>): Array<EvidenceRef> {
  const seen = new Set<string>();

  return evidence.filter((item) => {
    const key = `${item.sessionID}:${item.messageID ?? ""}:${item.partID ?? ""}:${item.sourceType}:${item.excerpt ?? ""}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function takeEvidence(evidence: Array<EvidenceRef>, limit = 5): Array<EvidenceRef> {
  return dedupeEvidence(evidence).slice(0, limit);
}

/**
 * Map an inferred evidence count to a confidence score (0–1).
 * Explicit-user constraints should use higher base confidence.
 */
export function confidenceFromCount(
  count: number,
  total: number,
  isExplicit = false,
): number {
  if (total === 0) return 0;
  const raw = count / total;
  // Sigmoid-like scaling: more evidence → higher confidence, with diminishing returns
  const scaled = 1 - 1 / (1 + raw * 2);
  // Explicit constraints start higher; inferred patterns start moderate
  const base = isExplicit ? 0.8 : 0.5;
  return Math.min(1, base + scaled * (isExplicit ? 0.2 : 0.4));
}
