import { writeDirectoryArtifacts } from "./staged-directory-write.js";
import type { ClaimManifest, SkepticReport, VerifierReport } from "../harness/types.js";
import { sanitizePersistedTraces } from "../llm/trace.js";
import type { LLMTrace } from "../normalize/models.js";
import { assertValidSkillMarkdown } from "../generate/skill-lint.js";
import { redactSecretsFromString, stringifyRedactedJson } from "../shared/redaction.js";

export async function writeGeneratedArtifacts(input: {
  outputDirectory: string;
  summary: string;
  skill: string;
  force: boolean;
}): Promise<{
  summaryPath: string;
  skillPath: string;
}> {
  assertValidSkillMarkdown(input.skill);

  const paths = await writeDirectoryArtifacts({
    outputDirectory: input.outputDirectory,
    force: input.force,
    files: {
      "summary.md": redactSecretsFromString(input.summary),
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
  assertValidSkillMarkdown(input.skill);

  const paths = await writeDirectoryArtifacts({
    outputDirectory: input.outputDirectory,
    force: input.force,
    files: {
      "summary.md": redactSecretsFromString(input.summary),
      "SKILL.md": input.skill,
      "merged-claims.json": stringifyRedactedJson(input.mergedClaims),
      "skill-plan.json": stringifyRedactedJson(input.skillPlan),
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
  assertValidSkillMarkdown(input.skill);

  const files: Record<string, string> = {
    "summary.md": redactSecretsFromString(input.summary),
    "SKILL.md": input.skill,
    "claim-manifest.json": stringifyRedactedJson(input.claimManifest),
    "skeptic-report.json": stringifyRedactedJson(input.skepticReport),
    "verifier-report.json": stringifyRedactedJson(input.verifierReport),
  };

  if (input.traces && input.traces.length > 0) {
    files["llm-traces.json"] = stringifyRedactedJson(sanitizePersistedTraces(input.traces));
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
