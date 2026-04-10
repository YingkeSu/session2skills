import type {
  CandidateClaim,
  EvidenceRef,
  MergedClaim,
  NormalizedSession,
  PreferenceProfile,
  WorkflowSignal,
} from "../normalize/models.js";

import { extractCommunicationStyleClaims } from "../analyze/extract-communication-style.js";
import { extractConstraintClaims } from "../analyze/extract-constraints.js";
import { extractValidationHabitClaims } from "../analyze/extract-validation-habits.js";
import { extractWorkStyleClaims } from "../analyze/extract-work-style.js";

export { buildProfileV2, type BuildProfileV2Options } from "./profile-v2.js";

export function extractAllRuleClaims(sessions: Array<NormalizedSession>): Array<CandidateClaim> {
  return [
    ...extractWorkStyleClaims(sessions),
    ...extractCommunicationStyleClaims(sessions),
    ...extractValidationHabitClaims(sessions),
    ...extractConstraintClaims(sessions),
  ];
}

export function buildPreferenceProfile(sessions: Array<NormalizedSession>): PreferenceProfile {
  const workStyleClaims = extractWorkStyleClaims(sessions);
  const communicationStyleClaims = extractCommunicationStyleClaims(sessions);
  const validationHabitsClaims = extractValidationHabitClaims(sessions);
  const constraintsClaims = extractConstraintClaims(sessions);

  const workStyle = claimsToLegacySignals(workStyleClaims);
  const communicationStyle = claimsToLegacySignals(communicationStyleClaims);
  const validationHabits = claimsToLegacySignals(validationHabitsClaims);
  const constraints = claimsToLegacySignals(constraintsClaims);

  return {
    workStyle,
    communicationStyle,
    validationHabits,
    constraints,
    confidenceNotes: buildConfidenceNotes({ workStyle, communicationStyle, validationHabits, constraints }),
  };
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

function claimsToLegacySignals(claims: Array<CandidateClaim>): Array<WorkflowSignal> {
  return claims.map((claim) => ({
    kind: claim.dimension,
    value: claim.label as string,
    weight: Math.round(claim.confidence * 10),
    evidence: claim.citations.map((cit): EvidenceRef => ({
      sessionID: cit.sessionID,
      messageID: cit.messageID,
      partID: cit.partID,
      sourceType: cit.sourceType,
      excerpt: cit.excerpt,
    })),
  }));
}

function buildConfidenceNotes(profile: Omit<PreferenceProfile, "confidenceNotes">): Array<string> {
  const notes: Array<string> = [];

  for (const [key, signals] of Object.entries(profile)) {
    if (signals.length === 0) {
      notes.push(`${key}: no strong evidence detected yet`);
      continue;
    }

    notes.push(`${key}: strongest signal \`${signals[0].value}\` with weight ${signals[0].weight}`);
  }

  return notes;
}
