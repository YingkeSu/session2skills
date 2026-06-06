import type {
  CandidateClaim,
  NormalizedSession,
  TokenEfficiencyLabel,
} from "../normalize/models.js";

import {
  confidenceFromCount,
  createRuleClaim,
  toCitations,
} from "./helpers.js";

const EXTRACTOR_ID = "extract-token-efficiency";

// Thresholds derived from research-backed token ratio analysis.
// Real-world data: 93% input, 4% output, 2.5% reasoning (OpenRouter 2026).
const EXPLORER_OUTPUT_RATIO_MAX = 0.4;
const IMPLEMENTER_OUTPUT_RATIO_MIN = 0.8;
const ANALYTICAL_REASONING_RATIO_MIN = 0.25;
const CONTEXT_REUSER_CACHE_RATIO_MIN = 0.3;

export function extractTokenEfficiencyClaims(sessions: Array<NormalizedSession>): Array<CandidateClaim<"token-efficiency">> {
  const claims: Array<CandidateClaim<"token-efficiency">> = [];
  const explorerEvidence: Array<ReturnType<typeof buildEvidence>> = [];
  const implementerEvidence: Array<ReturnType<typeof buildEvidence>> = [];
  const analyticalEvidence: Array<ReturnType<typeof buildEvidence>> = [];
  const contextReuserEvidence: Array<ReturnType<typeof buildEvidence>> = [];

  for (const session of sessions) {
    const totals = aggregateAssistantTokens(session);
    if (!totals) continue;

    const outputRatio = safeRatio(totals.output, totals.input);
    const reasoningRatio = safeRatio(totals.reasoning, totals.input + totals.output);
    const cacheRatio = safeRatio(totals.cacheRead, totals.input);

    if (outputRatio !== null && outputRatio < EXPLORER_OUTPUT_RATIO_MAX) {
      explorerEvidence.push(buildEvidence(session, `output/input ratio: ${outputRatio.toFixed(2)}`));
    }

    if (outputRatio !== null && outputRatio > IMPLEMENTER_OUTPUT_RATIO_MIN) {
      implementerEvidence.push(buildEvidence(session, `output/input ratio: ${outputRatio.toFixed(2)}`));
    }

    if (reasoningRatio !== null && reasoningRatio > ANALYTICAL_REASONING_RATIO_MIN) {
      analyticalEvidence.push(buildEvidence(session, `reasoning ratio: ${reasoningRatio.toFixed(2)}`));
    }

    if (cacheRatio !== null && cacheRatio > CONTEXT_REUSER_CACHE_RATIO_MIN) {
      contextReuserEvidence.push(buildEvidence(session, `cache read ratio: ${cacheRatio.toFixed(2)}`));
    }
  }

  const totalSessions = sessions.length || 1;

  if (explorerEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "explorer",
      "token-efficiency",
      "explorer" as TokenEfficiencyLabel,
      confidenceFromCount(explorerEvidence.length, totalSessions),
      `High input-to-output token ratio (< ${EXPLORER_OUTPUT_RATIO_MAX}) in ${explorerEvidence.length}/${totalSessions} sessions`,
      toCitations(explorerEvidence),
    ));
  }

  if (implementerEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "implementer",
      "token-efficiency",
      "implementer" as TokenEfficiencyLabel,
      confidenceFromCount(implementerEvidence.length, totalSessions),
      `High output-to-input token ratio (> ${IMPLEMENTER_OUTPUT_RATIO_MIN}) in ${implementerEvidence.length}/${totalSessions} sessions`,
      toCitations(implementerEvidence),
    ));
  }

  if (analyticalEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "analytical",
      "token-efficiency",
      "analytical" as TokenEfficiencyLabel,
      confidenceFromCount(analyticalEvidence.length, totalSessions),
      `High reasoning token ratio (> ${ANALYTICAL_REASONING_RATIO_MIN}) in ${analyticalEvidence.length}/${totalSessions} sessions`,
      toCitations(analyticalEvidence),
    ));
  }

  if (contextReuserEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "context-reuser",
      "token-efficiency",
      "context-reuser" as TokenEfficiencyLabel,
      confidenceFromCount(contextReuserEvidence.length, totalSessions),
      `High cache read ratio (> ${CONTEXT_REUSER_CACHE_RATIO_MIN}) in ${contextReuserEvidence.length}/${totalSessions} sessions`,
      toCitations(contextReuserEvidence),
    ));
  }

  return claims.sort((a, b) => b.confidence - a.confidence);
}

function aggregateAssistantTokens(session: NormalizedSession): {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
} | null {
  let input = 0;
  let output = 0;
  let reasoning = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let hasData = false;

  for (const message of session.messages) {
    if (message.role !== "assistant" || !message.tokens) continue;
    input += message.tokens.input;
    output += message.tokens.output;
    reasoning += message.tokens.reasoning;
    cacheRead += message.tokens.cache.read;
    cacheWrite += message.tokens.cache.write;
    hasData = true;
  }

  if (!hasData) return null;
  return { input, output, reasoning, cacheRead, cacheWrite };
}

function safeRatio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

function buildEvidence(session: NormalizedSession, detail?: string) {
  return {
    sessionID: session.id,
    sourceType: "message" as const,
    excerpt: detail ? `${session.title} (${detail})` : session.title,
  };
}
