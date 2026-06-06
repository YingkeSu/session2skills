import { writeDirectoryArtifacts } from "./staged-directory-write.js";
import type { ClaimManifest, SkepticReport, VerifierReport } from "../harness/types.js";
import { sanitizePersistedTraces } from "../llm/trace.js";
import type { LLMTrace } from "../normalize/models.js";

export async function writeGeneratedArtifacts(input: {
  outputDirectory: string;
  summary: string;
  skill: string;
  force: boolean;
}): Promise<{
  summaryPath: string;
  skillPath: string;
}> {
  const paths = await writeDirectoryArtifacts({
    outputDirectory: input.outputDirectory,
    force: input.force,
    files: {
      "summary.md": input.summary,
      "SKILL.md": input.skill,
    },
  });

  return {
    summaryPath: paths["summary.md"]!,
    skillPath: paths["SKILL.md"]!,
  };
}

export async function writeHybridGeneratedArtifacts(input: {
  outputDirectory: string;
  summary: string;
  skill: string;
  mergedClaims: unknown;
  skillPlan: unknown;
  force: boolean;
}): Promise<{
  summaryPath: string;
  skillPath: string;
  mergedClaimsPath: string;
  skillPlanPath: string;
}> {
  const paths = await writeDirectoryArtifacts({
    outputDirectory: input.outputDirectory,
    force: input.force,
    files: {
      "summary.md": input.summary,
      "SKILL.md": input.skill,
      "merged-claims.json": JSON.stringify(input.mergedClaims, null, 2),
      "skill-plan.json": JSON.stringify(input.skillPlan, null, 2),
    },
  });

  return {
    summaryPath: paths["summary.md"]!,
    skillPath: paths["SKILL.md"]!,
    mergedClaimsPath: paths["merged-claims.json"]!,
    skillPlanPath: paths["skill-plan.json"]!,
  };
}

export async function writeHarnessGeneratedArtifacts(input: {
  outputDirectory: string;
  summary: string;
  skill: string;
  claimManifest: ClaimManifest;
  skepticReport: SkepticReport;
  verifierReport: VerifierReport;
  traces?: ReadonlyArray<LLMTrace>;
  force: boolean;
}): Promise<{
  summaryPath: string;
  skillPath: string;
  claimManifestPath: string;
  skepticReportPath: string;
  verifierReportPath: string;
  tracesPath: string | null;
}> {
  const files: Record<string, string> = {
    "summary.md": input.summary,
    "SKILL.md": input.skill,
    "claim-manifest.json": JSON.stringify(input.claimManifest, null, 2),
    "skeptic-report.json": JSON.stringify(input.skepticReport, null, 2),
    "verifier-report.json": JSON.stringify(input.verifierReport, null, 2),
  };

  if (input.traces && input.traces.length > 0) {
    files["llm-traces.json"] = JSON.stringify(sanitizePersistedTraces(input.traces), null, 2);
  }

  const paths = await writeDirectoryArtifacts({
    outputDirectory: input.outputDirectory,
    force: input.force,
    files,
  });

  return {
    summaryPath: paths["summary.md"]!,
    skillPath: paths["SKILL.md"]!,
    claimManifestPath: paths["claim-manifest.json"]!,
    skepticReportPath: paths["skeptic-report.json"]!,
    verifierReportPath: paths["verifier-report.json"]!,
    tracesPath: paths["llm-traces.json"] ?? null,
  };
}
