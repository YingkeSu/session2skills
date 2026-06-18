import type { HarnessResult, ManifestClaim, SkepticReport, VerifierReport } from "../harness/types.js";
import type { WorkflowSignalKind } from "../normalize/models.js";
import type { TonePreset } from "../shared/cli.js";

export type SummaryOptions = {
  tone?: TonePreset;
  confidenceNotes?: Array<string>;
};

const DIMENSION_LABELS: Record<WorkflowSignalKind, string> = {
  "work-style": "Work style",
  "communication-style": "Communication style",
  "validation-habit": "Validation habits",
  "constraint": "Constraints",
  "token-efficiency": "Token efficiency",
  "model-selection": "Model selection",
  "delegation-pattern": "Delegation patterns",
};

const DIMENSION_ORDER: Array<WorkflowSignalKind> = [
  "work-style",
  "communication-style",
  "validation-habit",
  "constraint",
  "token-efficiency",
  "model-selection",
  "delegation-pattern",
];

export function renderSummary(
  harnessResult: HarnessResult,
  options: SummaryOptions = {},
): string {
  const tone = options.tone ?? "balanced";
  const manifest = harnessResult.revisedManifest ?? harnessResult.manifest;
  const lines: Array<string> = [];

  renderHeader(lines, tone, manifest.claims.length, manifest.metadata.generatedAt);
  renderClaimManifest(lines, manifest.claims, tone);
  if (harnessResult.skepticReport) {
    renderSkepticReport(lines, harnessResult.skepticReport);
  }
  if (harnessResult.verifierReport) {
    renderVerifierReport(lines, harnessResult.verifierReport);
  }
  renderConfidenceNotes(lines, options.confidenceNotes);

  return lines.join("\n");
}

function renderHeader(
  lines: Array<string>,
  tone: TonePreset,
  claimCount: number,
  generatedAt: string,
): void {
  lines.push(
    "# Session2Skills Audit Summary",
    "",
    `- generated: ${generatedAt}`,
    `- tone: ${tone}`,
    `- claims: ${claimCount}`,
    "",
  );
}

function renderClaimManifest(
  lines: Array<string>,
  claims: Array<ManifestClaim>,
  tone: TonePreset,
): void {
  lines.push("## Claim Manifest", "");

  if (claims.length === 0) {
    lines.push("No claims extracted.", "");
    return;
  }

  const grouped = groupClaimsByDimension(claims);
  for (const dimension of DIMENSION_ORDER) {
    const dimensionClaims = grouped.get(dimension);
    if (!dimensionClaims || dimensionClaims.length === 0) {
      continue;
    }

    lines.push(`### ${dimensionLabel(dimension)}`, "");
    for (const claim of dimensionClaims) {
      const evidence = claim.evidenceRefs.length > 0
        ? ` (evidence: ${claim.evidenceRefs.join(", ")})`
        : "";
      lines.push(`- **${claim.label}** (confidence: ${claim.confidence.toFixed(2)})${evidence}`);
      if (tone !== "concise" && claim.rationale) {
        lines.push("", `  > ${claim.rationale}`);
      }
    }
    lines.push("");
  }
}

function renderSkepticReport(
  lines: Array<string>,
  report: SkepticReport,
): void {
  lines.push(
    "## Skeptic Report",
    "",
    `- overall score: ${report.overallScore.toFixed(2)}`,
    `- issues: ${report.issues.length}`,
    "",
  );

  const highSeverity = report.issues.filter((issue) => issue.severity === "high");
  if (highSeverity.length > 0) {
    lines.push("### High-severity issues", "");
    for (const issue of highSeverity) {
      lines.push(
        `- **${issue.claimId}** (${issue.problemType}): ${issue.detail}`,
      );
    }
    lines.push("");
  }
}

function renderVerifierReport(
  lines: Array<string>,
  report: VerifierReport,
): void {
  lines.push(
    "## Verifier Report",
    "",
    `- result: ${report.pass ? "PASSED" : "FAILED"}`,
    `- checked items: ${report.checkedItems.length}`,
    `- fabricated directives: ${report.metadata.fabricatedCount}`,
    "",
  );

  if (!report.pass && report.issues.length > 0) {
    lines.push("### Verifier issues", "");
    for (const issue of report.issues) {
      lines.push(`- [${issue.severity}] ${issue.location}: ${issue.description}`);
    }
    lines.push("");
  }
}

function renderConfidenceNotes(
  lines: Array<string>,
  notes: Array<string> | undefined,
): void {
  if (!notes || notes.length === 0) {
    return;
  }

  lines.push("## Confidence Notes", "");
  for (const note of notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
}

function groupClaimsByDimension(
  claims: Array<ManifestClaim>,
): Map<WorkflowSignalKind, Array<ManifestClaim>> {
  const grouped = new Map<WorkflowSignalKind, Array<ManifestClaim>>();
  for (const claim of claims) {
    const bucket = grouped.get(claim.dimension);
    if (bucket) {
      bucket.push(claim);
    } else {
      grouped.set(claim.dimension, [claim]);
    }
  }
  return grouped;
}

function dimensionLabel(dimension: WorkflowSignalKind): string {
  return DIMENSION_LABELS[dimension];
}
