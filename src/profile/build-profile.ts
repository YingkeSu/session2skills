import type {
  CandidateClaim,
  MergedClaim,
  NormalizedSession,
} from "../normalize/models.js";

import { extractCommunicationStyleClaims } from "../analyze/extract-communication-style.js";
import { extractConstraintClaims } from "../analyze/extract-constraints.js";
import { extractDelegationPatternClaims } from "../analyze/extract-delegation-pattern.js";
import { extractModelSelectionClaims } from "../analyze/extract-model-selection.js";
import { extractTokenEfficiencyClaims } from "../analyze/extract-token-efficiency.js";
import { extractValidationHabitClaims } from "../analyze/extract-validation-habits.js";
import { extractWorkStyleClaims } from "../analyze/extract-work-style.js";

export { buildProfileV2, type BuildProfileV2Options } from "./profile-v2.js";

export function extractAllRuleClaims(sessions: Array<NormalizedSession>): Array<CandidateClaim> {
  const claims = [
    ...extractWorkStyleClaims(sessions),
    ...extractCommunicationStyleClaims(sessions),
    ...extractValidationHabitClaims(sessions),
    ...extractConstraintClaims(sessions),
    ...extractTokenEfficiencyClaims(sessions),
    ...extractModelSelectionClaims(sessions),
    ...extractDelegationPatternClaims(sessions),
  ];

  return claims.sort((a, b) => b.confidence - a.confidence);
}

export function buildMergedRuleClaims(sessions: Array<NormalizedSession>): Array<MergedClaim> {
  const ruleClaims = extractAllRuleClaims(sessions);
  const mergedByKey = new Map<string, MergedClaim>();

  for (const claim of ruleClaims) {
    const key = `${claim.dimension}:${String(claim.label)}`;
    const existing = mergedByKey.get(key);

    if (!existing) {
      mergedByKey.set(key, {
        schemaVersion: "merged-claim/v1",
        claimID: `merged:${claim.dimension}:${String(claim.label)}`,
        dimension: claim.dimension,
        label: claim.label,
        confidence: claim.confidence,
        rationale: claim.rationale,
        citations: [...claim.citations],
        sources: [
          {
            claimID: claim.claimID,
            dimension: claim.dimension,
            label: claim.label,
            confidence: claim.confidence,
            source: claim.source,
          },
        ],
      });
      continue;
    }

    existing.confidence = Math.max(existing.confidence, claim.confidence);
    existing.rationale = `${existing.rationale} ${claim.rationale}`.trim();
    existing.citations = dedupeCitations([...existing.citations, ...claim.citations]);
    existing.sources.push({
      claimID: claim.claimID,
      dimension: claim.dimension,
      label: claim.label,
      confidence: claim.confidence,
      source: claim.source,
    });
  }

  return [...mergedByKey.values()].sort((left, right) => right.confidence - left.confidence || left.claimID.localeCompare(right.claimID));
}

function dedupeCitations(citations: MergedClaim["citations"]): MergedClaim["citations"] {
  const seen = new Map<string, MergedClaim["citations"][number]>();

  for (const citation of citations) {
    const key = citation.evidenceID || `${citation.sessionID}:${citation.messageID ?? ""}:${citation.partID ?? ""}:${citation.excerpt ?? ""}`;
    if (!seen.has(key)) {
      seen.set(key, citation);
    }
  }

  return [...seen.values()];
}
