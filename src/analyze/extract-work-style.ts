import type {
  CandidateClaim,
  NormalizedSession,
  WorkStyleLabel,
} from "../normalize/models.js";

import {
  confidenceFromCount,
  createRuleClaim,
  toCitations,
} from "./helpers.js";

const DISCOVERY_TOOLS = new Set(["read", "grep", "glob", "task", "websearch_web_search_exa", "context7_resolve-library-id", "lsp_symbols", "lsp_goto_definition"]);
const MODIFICATION_TOOLS = new Set(["apply_patch", "write", "edit", "ast_grep_replace"]);

const EXTRACTOR_ID = "extract-work-style";

export function extractWorkStyleClaims(sessions: Array<NormalizedSession>): Array<CandidateClaim<"work-style">> {
  const claims: Array<CandidateClaim<"work-style">> = [];
  const analysisFirstEvidence: Array<ReturnType<typeof buildEvidence>> = [];
  const implementationFirstEvidence: Array<ReturnType<typeof buildEvidence>> = [];
  const iterativeEvidence: Array<ReturnType<typeof buildEvidence>> = [];
  const oneShotEvidence: Array<ReturnType<typeof buildEvidence>> = [];

  for (const session of sessions) {
    const toolOrder = session.toolInvocations.map((tool) => tool.toolName);
    const firstDiscovery = toolOrder.findIndex((tool) => DISCOVERY_TOOLS.has(tool));
    const firstModification = toolOrder.findIndex((tool) => MODIFICATION_TOOLS.has(tool));

    if (firstDiscovery !== -1 && (firstModification === -1 || firstDiscovery < firstModification)) {
      analysisFirstEvidence.push(buildEvidence(session));
    }

    if (firstModification !== -1 && (firstDiscovery === -1 || firstModification < firstDiscovery)) {
      implementationFirstEvidence.push(buildEvidence(session));
    }

    if (session.toolInvocations.length >= 6 || session.messages.length >= 8) {
      iterativeEvidence.push(buildEvidence(session));
    } else {
      oneShotEvidence.push(buildEvidence(session));
    }
  }

  const totalSessions = sessions.length || 1;

  if (analysisFirstEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "analysis-first",
      "work-style",
      "analysis-first" as WorkStyleLabel,
      confidenceFromCount(analysisFirstEvidence.length, totalSessions),
      `Discovery tools precede modification in ${analysisFirstEvidence.length}/${totalSessions} sessions`,
      toCitations(analysisFirstEvidence),
    ));
  }

  if (implementationFirstEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "implementation-first",
      "work-style",
      "implementation-first" as WorkStyleLabel,
      confidenceFromCount(implementationFirstEvidence.length, totalSessions),
      `Modification tools precede discovery in ${implementationFirstEvidence.length}/${totalSessions} sessions`,
      toCitations(implementationFirstEvidence),
    ));
  }

  if (iterativeEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "iterative",
      "work-style",
      "iterative" as WorkStyleLabel,
      confidenceFromCount(iterativeEvidence.length, totalSessions),
      `High tool/message count (>=6 tools or >=8 messages) in ${iterativeEvidence.length}/${totalSessions} sessions`,
      toCitations(iterativeEvidence),
    ));
  }

  if (oneShotEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "one-shot",
      "work-style",
      "one-shot" as WorkStyleLabel,
      confidenceFromCount(oneShotEvidence.length, totalSessions),
      `Low tool/message count in ${oneShotEvidence.length}/${totalSessions} sessions`,
      toCitations(oneShotEvidence),
    ));
  }

  return claims.sort((a, b) => b.confidence - a.confidence);
}

function buildEvidence(session: NormalizedSession) {
  return {
    sessionID: session.id,
    sourceType: "message" as const,
    excerpt: session.title,
  };
}
