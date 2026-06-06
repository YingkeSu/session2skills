import type {
  CandidateClaim,
  NormalizedSession,
  ModelSelectionLabel,
} from "../normalize/models.js";

import {
  confidenceFromCount,
  createRuleClaim,
  toCitations,
} from "./helpers.js";

const EXTRACTOR_ID = "extract-model-selection";

// Model tier heuristic based on common naming patterns.
// tier-1: frontier/expensive models (opus, o1, o3, gemini-pro, etc.)
// tier-2: mid-range models (sonnet, gpt-4o, deepseek-chat, etc.)
// tier-3: budget models (haiku, mini, flash-lite, etc.)
const TIER_PATTERNS: Array<{ pattern: RegExp; tier: number }> = [
  { pattern: /opus|o1\b|o3\b|gemini.*pro(?!.*flash)|claude-4(?!.*haiku)|gpt-5(?!.*mini)/i, tier: 1 },
  { pattern: /haiku|mini|flash-lite|flash.?lite|micro|nano|tiny/i, tier: 3 },
  { pattern: /sonnet|gpt-4o(?!-mini)|gpt-5.*mini|deepseek-chat|gemini.*flash|glm-4/i, tier: 2 },
];

function classifyModelTier(modelID: string): number {
  for (const { pattern, tier } of TIER_PATTERNS) {
    if (pattern.test(modelID)) return tier;
  }
  return 2; // default to mid-tier for unknown models
}

const COST_CONSCIOUS_TIER23_RATIO = 0.6;
const QUALITY_FOCUSED_TIER1_RATIO = 0.8;
const ADAPTIVE_MIN_TIERS = 2;
const ADAPTIVE_MIN_SWITCHES = 2;

export function extractModelSelectionClaims(sessions: Array<NormalizedSession>): Array<CandidateClaim<"model-selection">> {
  const claims: Array<CandidateClaim<"model-selection">> = [];
  const costConsciousEvidence: Array<ReturnType<typeof buildEvidence>> = [];
  const qualityFocusedEvidence: Array<ReturnType<typeof buildEvidence>> = [];
  const adaptiveEvidence: Array<ReturnType<typeof buildEvidence>> = [];

  for (const session of sessions) {
    const modelUsage = collectModelUsage(session);
    if (!modelUsage) continue;

    const { total, tierCounts, switches, uniqueTiers } = modelUsage;

    const tier1Ratio = (tierCounts[1] ?? 0) / total;
    const tier23Ratio = ((tierCounts[2] ?? 0) + (tierCounts[3] ?? 0)) / total;

    if (tier23Ratio >= COST_CONSCIOUS_TIER23_RATIO) {
      costConsciousEvidence.push(buildEvidence(session, `tier-2/3 ratio: ${tier23Ratio.toFixed(2)}`));
    }

    if (tier1Ratio >= QUALITY_FOCUSED_TIER1_RATIO) {
      qualityFocusedEvidence.push(buildEvidence(session, `tier-1 ratio: ${tier1Ratio.toFixed(2)}`));
    }

    if (uniqueTiers >= ADAPTIVE_MIN_TIERS && switches >= ADAPTIVE_MIN_SWITCHES) {
      adaptiveEvidence.push(buildEvidence(session, `${uniqueTiers} tiers, ${switches} switches`));
    }
  }

  const totalSessions = sessions.length || 1;

  if (costConsciousEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "cost-conscious",
      "model-selection",
      "cost-conscious" as ModelSelectionLabel,
      confidenceFromCount(costConsciousEvidence.length, totalSessions),
      `Tier-2/3 models used for >${Math.round(COST_CONSCIOUS_TIER23_RATIO * 100)}% of interactions in ${costConsciousEvidence.length}/${totalSessions} sessions`,
      toCitations(costConsciousEvidence),
    ));
  }

  if (qualityFocusedEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "quality-focused",
      "model-selection",
      "quality-focused" as ModelSelectionLabel,
      confidenceFromCount(qualityFocusedEvidence.length, totalSessions),
      `Tier-1 frontier models used for >${Math.round(QUALITY_FOCUSED_TIER1_RATIO * 100)}% of interactions in ${qualityFocusedEvidence.length}/${totalSessions} sessions`,
      toCitations(qualityFocusedEvidence),
    ));
  }

  if (adaptiveEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "adaptive",
      "model-selection",
      "adaptive" as ModelSelectionLabel,
      confidenceFromCount(adaptiveEvidence.length, totalSessions),
      `Multiple model tiers with switching in ${adaptiveEvidence.length}/${totalSessions} sessions`,
      toCitations(adaptiveEvidence),
    ));
  }

  return claims.sort((a, b) => b.confidence - a.confidence);
}

function collectModelUsage(session: NormalizedSession): {
  total: number;
  tierCounts: Record<number, number>;
  switches: number;
  uniqueTiers: number;
} | null {
  const tierCounts: Record<number, number> = {};
  const tiersSeen = new Set<number>();
  let total = 0;
  let switches = 0;
  let lastModelID: string | null = null;

  for (const message of session.messages) {
    if (message.role !== "assistant" || !message.modelID) continue;

    const modelID = message.modelID;
    const tier = classifyModelTier(modelID);

    tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
    tiersSeen.add(tier);
    total++;

    if (lastModelID !== null && lastModelID !== modelID) {
      switches++;
    }
    lastModelID = modelID;
  }

  if (total === 0) return null;
  return { total, tierCounts, switches, uniqueTiers: tiersSeen.size };
}

function buildEvidence(session: NormalizedSession, detail?: string) {
  return {
    sessionID: session.id,
    sourceType: "message" as const,
    excerpt: detail ? `${session.title} (${detail})` : session.title,
  };
}
