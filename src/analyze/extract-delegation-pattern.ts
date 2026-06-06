import type {
  CandidateClaim,
  NormalizedSession,
  DelegationPatternLabel,
} from "../normalize/models.js";

import {
  confidenceFromCount,
  createRuleClaim,
  toCitations,
} from "./helpers.js";

const EXTRACTOR_ID = "extract-delegation-pattern";

const HANDS_ON_MAX_DEPTH = 1;
const HANDS_ON_MAX_CHILDREN = 2;
const TRUSTING_MIN_DEPTH = 3;
const PARALLELIZER_MIN_BREADTH = 3;

export function extractDelegationPatternClaims(sessions: Array<NormalizedSession>): Array<CandidateClaim<"delegation-pattern">> {
  const claims: Array<CandidateClaim<"delegation-pattern">> = [];
  const handsOnEvidence: Array<ReturnType<typeof buildEvidence>> = [];
  const trustingEvidence: Array<ReturnType<typeof buildEvidence>> = [];
  const parallelizerEvidence: Array<ReturnType<typeof buildEvidence>> = [];

  const sessionMap = new Map<string, NormalizedSession>();
  for (const session of sessions) {
    sessionMap.set(session.id, session);
  }

  // Build parent → children map from sessions that have parentID
  const childrenByParent = new Map<string, Array<string>>();
  const rootIDs: Array<string> = [];

  for (const session of sessions) {
    if (session.parentID && sessionMap.has(session.parentID)) {
      const children = childrenByParent.get(session.parentID) ?? [];
      children.push(session.id);
      childrenByParent.set(session.parentID, children);
    } else {
      rootIDs.push(session.id);
    }
  }

  // Analyze each root session's delegation tree
  for (const rootID of rootIDs) {
    const root = sessionMap.get(rootID);
    if (!root) continue;

    const { maxDepth, maxBreadth } = computeTreeMetrics(rootID, sessionMap);

    const childCount = childrenByParent.get(rootID)?.length ?? 0;

    if (maxDepth <= HANDS_ON_MAX_DEPTH && childCount <= HANDS_ON_MAX_CHILDREN) {
      handsOnEvidence.push(buildEvidence(root, `depth: ${maxDepth}, children: ${childCount}`));
    }

    if (maxDepth >= TRUSTING_MIN_DEPTH) {
      trustingEvidence.push(buildEvidence(root, `depth: ${maxDepth}`));
    }

    if (maxBreadth >= PARALLELIZER_MIN_BREADTH) {
      parallelizerEvidence.push(buildEvidence(root, `breadth: ${maxBreadth}`));
    }
  }

  const totalRoots = rootIDs.length || 1;

  if (handsOnEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "hands-on",
      "delegation-pattern",
      "hands-on" as DelegationPatternLabel,
      confidenceFromCount(handsOnEvidence.length, totalRoots),
      `Shallow delegation (depth ≤ ${HANDS_ON_MAX_DEPTH}, children ≤ ${HANDS_ON_MAX_CHILDREN}) in ${handsOnEvidence.length}/${totalRoots} root sessions`,
      toCitations(handsOnEvidence),
    ));
  }

  if (trustingEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "trusting",
      "delegation-pattern",
      "trusting" as DelegationPatternLabel,
      confidenceFromCount(trustingEvidence.length, totalRoots),
      `Deep delegation (depth ≥ ${TRUSTING_MIN_DEPTH}) in ${trustingEvidence.length}/${totalRoots} root sessions`,
      toCitations(trustingEvidence),
    ));
  }

  if (parallelizerEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "parallelizer",
      "delegation-pattern",
      "parallelizer" as DelegationPatternLabel,
      confidenceFromCount(parallelizerEvidence.length, totalRoots),
      `Wide delegation (breadth ≥ ${PARALLELIZER_MIN_BREADTH}) in ${parallelizerEvidence.length}/${totalRoots} root sessions`,
      toCitations(parallelizerEvidence),
    ));
  }

  return claims.sort((a, b) => b.confidence - a.confidence);
}

function computeTreeMetrics(
  rootID: string,
  sessionMap: Map<string, NormalizedSession>,
): { maxDepth: number; maxBreadth: number } {
  let maxDepth = 0;
  let maxBreadth = 0;

  const visited = new Set<string>();

  function dfs(sessionID: string, depth: number): void {
    if (visited.has(sessionID)) return;
    visited.add(sessionID);

    maxDepth = Math.max(maxDepth, depth);

    const children: Array<string> = [];
    for (const session of sessionMap.values()) {
      if (session.parentID === sessionID && !visited.has(session.id)) {
        children.push(session.id);
      }
    }

    maxBreadth = Math.max(maxBreadth, children.length);

    for (const childID of children) {
      dfs(childID, depth + 1);
    }
  }

  dfs(rootID, 0);
  return { maxDepth, maxBreadth };
}

function buildEvidence(session: NormalizedSession, detail?: string) {
  return {
    sessionID: session.id,
    sourceType: "message" as const,
    excerpt: detail ? `${session.title} (${detail})` : session.title,
  };
}
