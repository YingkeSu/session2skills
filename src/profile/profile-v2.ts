import type {
  CandidateClaim,
  CandidateClaimSource,
  EvidenceRef,
  MergedClaim,
  ProfileSignal,
  ProfileV2,
  PromptSetVersion,
  TaxonomyExtensionLabel,
  WorkflowSignalKind,
} from "../normalize/models.js";
import { DEFAULT_PROMPT_SET_VERSION, PROFILE_V2_SCHEMA_VERSION } from "../normalize/models.js";

export type BuildProfileV2Options = {
  promptSetVersion?: PromptSetVersion;
  acceptedThreshold?: number;
  tentativeThreshold?: number;
  strongestSignalsPerDimension?: number;
  confidenceNotes?: Array<string>;
};

const DEFAULT_ACCEPTED_THRESHOLD = 0.7;
const DEFAULT_TENTATIVE_THRESHOLD = 0.3;
const DEFAULT_STRONGEST_SIGNALS_PER_DIMENSION = 3;

const WORK_STYLE_LABELS = new Set(["analysis-first", "implementation-first", "iterative", "one-shot"] as const);
const COMMUNICATION_STYLE_LABELS = new Set(["concise", "explanatory", "consultative", "directive"] as const);
const VALIDATION_HABIT_LABELS = new Set(["run-tests", "run-diagnostics", "check-git-state"] as const);
const CONSTRAINT_LABELS = new Set(["minimal-diff", "preserve-patterns", "type-safety", "avoid-destructive-actions"] as const);

const TOKEN_EFFICIENCY_LABELS = new Set(["explorer", "implementer", "analytical", "context-reuser"] as const);
const MODEL_SELECTION_LABELS = new Set(["cost-conscious", "quality-focused", "adaptive"] as const);
const DELEGATION_PATTERN_LABELS = new Set(["hands-on", "trusting", "parallelizer"] as const);

const WORKFLOW_SIGNAL_KINDS = [
  "work-style",
  "communication-style",
  "validation-habit",
  "constraint",
  "token-efficiency",
  "model-selection",
  "delegation-pattern",
] as const satisfies ReadonlyArray<WorkflowSignalKind>;

export function buildProfileV2(
  mergedClaims: Array<MergedClaim>,
  options: BuildProfileV2Options = {},
): ProfileV2 {
  const acceptedThreshold = options.acceptedThreshold ?? DEFAULT_ACCEPTED_THRESHOLD;
  const tentativeThreshold = options.tentativeThreshold ?? DEFAULT_TENTATIVE_THRESHOLD;
  const strongestSignalsPerDimension =
    options.strongestSignalsPerDimension ?? DEFAULT_STRONGEST_SIGNALS_PER_DIMENSION;
  const orderedClaims = [...mergedClaims].sort(compareMergedClaims);

  const strongestSignals = buildStrongestSignals(orderedClaims, strongestSignalsPerDimension);

  return {
    schemaVersion: PROFILE_V2_SCHEMA_VERSION,
    promptSetVersion: options.promptSetVersion ?? DEFAULT_PROMPT_SET_VERSION,
    workStyle: toProfileSignals("work-style", strongestSignals["work-style"], orderedClaims, WORK_STYLE_LABELS),
    communicationStyle: toProfileSignals(
      "communication-style",
      strongestSignals["communication-style"],
      orderedClaims,
      COMMUNICATION_STYLE_LABELS,
    ),
    validationHabits: toProfileSignals(
      "validation-habit",
      strongestSignals["validation-habit"],
      orderedClaims,
      VALIDATION_HABIT_LABELS,
    ),
    constraints: toProfileSignals("constraint", strongestSignals.constraint, orderedClaims, CONSTRAINT_LABELS),
    tokenEfficiency: toProfileSignals("token-efficiency", strongestSignals["token-efficiency"], orderedClaims, TOKEN_EFFICIENCY_LABELS),
    modelSelection: toProfileSignals("model-selection", strongestSignals["model-selection"], orderedClaims, MODEL_SELECTION_LABELS),
    delegationPattern: toProfileSignals("delegation-pattern", strongestSignals["delegation-pattern"], orderedClaims, DELEGATION_PATTERN_LABELS),
    strongestSignals,
    acceptedClaims: orderedClaims
      .filter((claim) => claim.confidence > acceptedThreshold)
      .map(toCandidateClaim),
    tentativeClaims: orderedClaims
      .filter((claim) => claim.confidence >= tentativeThreshold && claim.confidence <= acceptedThreshold)
      .map(toCandidateClaim),
    unresolvedAreas: buildUnresolvedAreas(strongestSignals, acceptedThreshold, tentativeThreshold),
    confidenceNotes: [
      ...buildConfidenceNotes(strongestSignals, acceptedThreshold, tentativeThreshold),
      ...(options.confidenceNotes ?? []),
    ],
    mergedClaims: orderedClaims,
  };
}

function buildStrongestSignals(
  mergedClaims: Array<MergedClaim>,
  strongestSignalsPerDimension: number,
): Record<WorkflowSignalKind, Array<MergedClaim>> {
  return {
    "work-style": mergedClaims
      .filter((claim) => claim.dimension === "work-style")
      .slice(0, strongestSignalsPerDimension),
    "communication-style": mergedClaims
      .filter((claim) => claim.dimension === "communication-style")
      .slice(0, strongestSignalsPerDimension),
    "validation-habit": mergedClaims
      .filter((claim) => claim.dimension === "validation-habit")
      .slice(0, strongestSignalsPerDimension),
    constraint: mergedClaims
      .filter((claim) => claim.dimension === "constraint")
      .slice(0, strongestSignalsPerDimension),
    "token-efficiency": mergedClaims
      .filter((claim) => claim.dimension === "token-efficiency")
      .slice(0, strongestSignalsPerDimension),
    "model-selection": mergedClaims
      .filter((claim) => claim.dimension === "model-selection")
      .slice(0, strongestSignalsPerDimension),
    "delegation-pattern": mergedClaims
      .filter((claim) => claim.dimension === "delegation-pattern")
      .slice(0, strongestSignalsPerDimension),
  };
}

function buildUnresolvedAreas(
  strongestSignals: Record<WorkflowSignalKind, Array<MergedClaim>>,
  acceptedThreshold: number,
  tentativeThreshold: number,
): Array<string> {
  const unresolvedAreas: Array<string> = [];

  for (const kind of WORKFLOW_SIGNAL_KINDS) {
    const strongest = strongestSignals[kind][0];

    if (!strongest) {
      unresolvedAreas.push(`${toDimensionLabel(kind)}: no supporting claims yet`);
      continue;
    }

    if (strongest.confidence < tentativeThreshold) {
      unresolvedAreas.push(`${toDimensionLabel(kind)}: evidence is too weak to trust yet`);
      continue;
    }

    if (strongest.confidence <= acceptedThreshold) {
      unresolvedAreas.push(
        `${toDimensionLabel(kind)}: strongest claim \`${strongest.label}\` is still tentative (${strongest.confidence.toFixed(2)})`,
      );
    }
  }

  return unresolvedAreas;
}

function buildConfidenceNotes(
  strongestSignals: Record<WorkflowSignalKind, Array<MergedClaim>>,
  acceptedThreshold: number,
  tentativeThreshold: number,
): Array<string> {
  const notes: Array<string> = [];

  for (const kind of WORKFLOW_SIGNAL_KINDS) {
    const strongest = strongestSignals[kind][0];
    const runnerUp = strongestSignals[kind][1];

    if (!strongest) {
      notes.push(`${toDimensionKey(kind)}: no merged claims survived review`);
      continue;
    }

    notes.push(`${toDimensionKey(kind)}: strongest claim \`${strongest.label}\` at confidence ${strongest.confidence.toFixed(2)}`);

    if (strongest.confidence >= tentativeThreshold && strongest.confidence <= acceptedThreshold) {
      notes.push(`${toDimensionKey(kind)}: evidence is present but still tentative`);
    }

    if (runnerUp && strongest.confidence - runnerUp.confidence <= 0.12) {
      notes.push(
        `${toDimensionKey(kind)}: close competing signal between \`${strongest.label}\` and \`${runnerUp.label}\``,
      );
    }
  }

  return notes;
}

function toCandidateClaim(claim: MergedClaim): CandidateClaim {
  return {
    schemaVersion: "candidate-claim/v1",
    claimID: claim.claimID,
    dimension: claim.dimension,
    label: claim.label,
    confidence: claim.confidence,
    rationale: claim.rationale,
    citations: claim.citations,
    source: pickPrimarySource(claim),
  };
}

function pickPrimarySource(claim: MergedClaim): CandidateClaimSource {
  return [...claim.sources].sort((left, right) => compareByConfidence(right, left))[0]?.source ?? {
    type: "rule",
    ruleID: `${claim.dimension}/${String(claim.label)}`,
  };
}

function toProfileSignals<K extends WorkflowSignalKind, T extends ProfileSignal<K>["value"]>(
  kind: K,
  strongestSignals: Array<MergedClaim>,
  orderedClaims: Array<MergedClaim>,
  labels: ReadonlySet<T>,
): Array<ProfileSignal<K>> {
  const claims = strongestSignals.length > 0
    ? strongestSignals
    : orderedClaims.filter((claim) => claim.dimension === kind);

  return claims.map((claim) => ({
    kind,
    value: normalizeLabel(String(claim.label), labels) as ProfileSignal<K>["value"],
    weight: Math.round(claim.confidence * 10),
    evidence: claim.citations.map((citation): EvidenceRef => ({
      sessionID: citation.sessionID,
      messageID: citation.messageID,
      partID: citation.partID,
      sourceType: citation.sourceType,
      excerpt: citation.excerpt,
    })),
  }));
}

function normalizeLabel<T extends string>(value: string, labels: ReadonlySet<T>): T | TaxonomyExtensionLabel {
  if (labels.has(value as T)) {
    return value as T;
  }

  if (value.startsWith("custom:")) {
    return value as TaxonomyExtensionLabel;
  }

  return `custom:${value}`;
}

function compareMergedClaims(left: MergedClaim, right: MergedClaim): number {
  return compareByConfidence(left, right) || left.claimID.localeCompare(right.claimID);
}

function compareByConfidence(left: { confidence: number }, right: { confidence: number }): number {
  return right.confidence - left.confidence;
}

function toDimensionLabel(kind: WorkflowSignalKind): string {
  switch (kind) {
    case "work-style":
      return "work style";
    case "communication-style":
      return "communication style";
    case "validation-habit":
      return "validation habits";
    case "constraint":
      return "constraints";
    case "token-efficiency":
      return "token efficiency";
    case "model-selection":
      return "model selection";
    case "delegation-pattern":
      return "delegation patterns";
  }
}

function toDimensionKey(kind: WorkflowSignalKind): string {
  switch (kind) {
    case "work-style":
      return "workStyle";
    case "communication-style":
      return "communicationStyle";
    case "validation-habit":
      return "validationHabits";
    case "constraint":
      return "constraints";
    case "token-efficiency":
      return "tokenEfficiency";
    case "model-selection":
      return "modelSelection";
    case "delegation-pattern":
      return "delegationPattern";
  }
}
