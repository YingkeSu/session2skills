import type {
  EvidenceRef,
  MergedClaim,
  MergedClaimSource,
  PreferenceProfile,
  ProfileV2,
  WorkflowSignalKind,
} from "../normalize/models.js";
import type { TonePreset } from "../shared/cli.js";

export type SummaryOptions = {
  tone?: TonePreset;
  topN?: number;
  unresolvedThreshold?: number;
};

export function renderSummary(
  profile: PreferenceProfile | ProfileV2,
  options: SummaryOptions = {},
): string {
  if (isProfileV2(profile)) {
    return renderProfileV2Summary(profile, options);
  }
  return renderLegacySummary(profile, options.tone ?? "balanced");
}

const DIMENSION_ORDER: ReadonlyArray<WorkflowSignalKind> = [
  "work-style",
  "communication-style",
  "validation-habit",
  "constraint",
  "token-efficiency",
  "model-selection",
  "delegation-pattern",
];

const DIMENSION_LABEL: Record<WorkflowSignalKind, string> = {
  "work-style": "Work style",
  "communication-style": "Communication style",
  "validation-habit": "Validation habits",
  constraint: "Constraints",
  "token-efficiency": "Token efficiency",
  "model-selection": "Model selection",
  "delegation-pattern": "Delegation patterns",
};

const DEFAULT_TOP_N = 3;
const DEFAULT_UNRESOLVED_THRESHOLD = 0.5;

function renderProfileV2Summary(
  profile: ProfileV2,
  options: SummaryOptions,
): string {
  const tone = options.tone ?? "balanced";
  const topN = options.topN ?? DEFAULT_TOP_N;
  const unresolvedThreshold = options.unresolvedThreshold ?? DEFAULT_UNRESOLVED_THRESHOLD;

  const claims = [...profile.mergedClaims].sort(compareMergedClaims);
  const byDimension = groupByDimension(claims);

  const lines: Array<string> = [
    "# Session2Skills Audit Summary",
    "",
    `schema: ${profile.schemaVersion}`,
    `prompt-set: ${profile.promptSetVersion}`,
    `claims: ${claims.length}`,
    "",
  ];

  appendStrongestSignals(lines, byDimension, topN, tone);
  appendConfidenceNotes(lines, profile.confidenceNotes);
  appendUnresolvedAreas(lines, claims, unresolvedThreshold, tone);
  appendEvidenceExcerpts(lines, claims, topN, tone);
  appendSourceAttribution(lines, claims);

  return lines.join("\n");
}

function appendStrongestSignals(
  lines: Array<string>,
  byDimension: Map<WorkflowSignalKind, Array<MergedClaim>>,
  topN: number,
  tone: TonePreset,
): void {
  lines.push("## Strongest Signals", "");
  for (const dim of DIMENSION_ORDER) {
    const dimClaims = byDimension.get(dim) ?? [];
    const top = dimClaims.slice(0, topN);
    if (top.length === 0) {
      lines.push(`### ${DIMENSION_LABEL[dim]}`, "- No claims.", "");
      continue;
    }
    lines.push(`### ${DIMENSION_LABEL[dim]}`, "");
    for (const claim of top) {
      lines.push(...renderClaimRow(claim, tone));
    }
    lines.push("");
  }
}

function appendConfidenceNotes(
  lines: Array<string>,
  notes: Array<string>,
): void {
  lines.push("## Confidence Notes", "");
  if (notes.length > 0) {
    lines.push(...notes.map((n) => `- ${n}`));
  } else {
    lines.push("- No additional confidence notes.");
  }
  lines.push("");
}

function appendUnresolvedAreas(
  lines: Array<string>,
  claims: Array<MergedClaim>,
  threshold: number,
  tone: TonePreset,
): void {
  lines.push("## Unresolved Areas", "");
  const unresolved = claims.filter((c) => c.confidence < threshold);
  if (unresolved.length > 0) {
    for (const claim of unresolved) {
      lines.push(
        `- ${claim.label} (${claim.dimension}): confidence ${fmtConf(claim.confidence)}${hasContradiction(claim) ? " [contradicted]" : ""}`,
      );
      if (claim.rationale && tone !== "concise") {
        lines.push(`  > ${claim.rationale}`);
      }
    }
  } else {
    lines.push("- No low-confidence or contradictory claims detected.");
  }
  lines.push("");
}

function appendEvidenceExcerpts(
  lines: Array<string>,
  claims: Array<MergedClaim>,
  topN: number,
  tone: TonePreset,
): void {
  lines.push("## Evidence Excerpts", "");
  const excerptLimit = tone === "concise" ? 1 : tone === "detailed" ? 5 : 3;
  const topClaims = claims.slice(0, topN * DIMENSION_ORDER.length);
  if (topClaims.length === 0) {
    lines.push("- No evidence available.");
  } else {
    for (const claim of topClaims) {
      const excerpts = claim.citations
        .slice(0, excerptLimit)
        .filter((c) => c.excerpt);
      if (excerpts.length === 0) continue;
      lines.push(`### ${claim.dimension}/${claim.label}`, "");
      for (const citation of excerpts) {
        const src = `${citation.sessionID}${citation.messageID ? `:${citation.messageID}` : ""}`;
        lines.push(`- [${citation.sourceType}] ${citation.excerpt!} (${src})`);
      }
      lines.push("");
    }
  }
}

function appendSourceAttribution(
  lines: Array<string>,
  claims: Array<MergedClaim>,
): void {
  lines.push("## Source Attribution", "");
  for (const claim of claims) {
    const types = deriveSourceTypes(claim.sources);
    lines.push(
      `- ${claim.claimID}: ${fmtConf(claim.confidence)} | ${types.join(", ")} | ${claim.sources.length} source(s)`,
    );
  }
  lines.push("");
}

function renderClaimRow(claim: MergedClaim, tone: TonePreset): Array<string> {
  const types = deriveSourceTypes(claim.sources);
  const contradiction = hasContradiction(claim);
  const status = contradiction ? "tentative" : "accepted";

  const lines: Array<string> = [
    `- **${claim.label}** (confidence: ${fmtConf(claim.confidence)}, status: ${status}, sources: ${types.join("+")})`,
  ];

  if (tone !== "concise" && claim.rationale) {
    lines.push(`  > ${claim.rationale}`);
  }

  if (tone === "detailed") {
    for (const src of claim.sources) {
      const srcType = src.source.type;
      const srcLabel = srcType === "rule" ? `rule:${src.source.ruleID}` : srcType;
      lines.push(`  - [${srcLabel}] ${src.label} (${fmtConf(src.confidence)})`);
    }
  }

  return lines;
}

type SummarySignal = {
  value: string;
  weight: number;
  evidence: Array<EvidenceRef>;
};

function renderLegacySummary(profile: PreferenceProfile, tone: TonePreset): string {
  return [
    "# Session2Skills Summary",
    "",
    "## Strongest signals",
    ...renderBullets([
      `work style: ${profile.workStyle[0]?.value ?? "not detected"}`,
      `communication style: ${profile.communicationStyle[0]?.value ?? "not detected"}`,
      `validation habit: ${profile.validationHabits[0]?.value ?? "not detected"}`,
      `constraint: ${profile.constraints[0]?.value ?? "not detected"}`,
    ]),
    "",
    "## Confidence notes",
    ...renderBullets(profile.confidenceNotes),
    "",
    "## Work style",
    ...renderSignalSection(profile.workStyle, tone),
    "",
    "## Communication style",
    ...renderSignalSection(profile.communicationStyle, tone),
    "",
    "## Validation habits",
    ...renderSignalSection(profile.validationHabits, tone),
    "",
    "## Constraints",
    ...renderSignalSection(profile.constraints, tone),
    "",
  ].join("\n");
}

function renderSignalSection(signals: Array<SummarySignal>, tone: TonePreset): Array<string> {
  if (signals.length === 0) {
    return ["- No strong evidence detected yet."];
  }

  const evidenceLimit = tone === "concise" ? 1 : tone === "detailed" ? 5 : 3;

  return signals.flatMap((signal) => [
    `- ${signal.value} (weight: ${signal.weight})`,
    ...signal.evidence.slice(0, evidenceLimit).map(
      (evidence) => `  - evidence: ${evidence.excerpt ?? `${evidence.sessionID}:${evidence.messageID ?? ""}`}`,
    ),
  ]);
}

function renderBullets(items: Array<string>): Array<string> {
  return items.map((item) => `- ${item}`);
}

function isProfileV2(profile: PreferenceProfile | ProfileV2): profile is ProfileV2 {
  return "schemaVersion" in profile && profile.schemaVersion === "profile/v2";
}

function compareMergedClaims(a: MergedClaim, b: MergedClaim): number {
  if (b.confidence !== a.confidence) {
    return b.confidence - a.confidence;
  }
  if (a.dimension !== b.dimension) {
    return a.dimension.localeCompare(b.dimension);
  }
  return a.claimID.localeCompare(b.claimID);
}

function groupByDimension(
  claims: Array<MergedClaim>,
): Map<WorkflowSignalKind, Array<MergedClaim>> {
  const map = new Map<WorkflowSignalKind, Array<MergedClaim>>();
  for (const claim of claims) {
    const existing = map.get(claim.dimension) ?? [];
    existing.push(claim);
    map.set(claim.dimension, existing);
  }
  return map;
}

function deriveSourceTypes(sources: Array<MergedClaimSource>): Array<string> {
  const types = new Set<string>();
  for (const src of sources) {
    if (src.source.type === "rule") {
      types.add("rule");
    } else {
      types.add("llm");
    }
  }
  return ["rule", "llm"].filter((type) => types.has(type));
}

function hasContradiction(claim: MergedClaim): boolean {
  return claim.rationale.includes("Contradictions surfaced");
}

function fmtConf(confidence: number): string {
  return confidence.toFixed(3);
}
