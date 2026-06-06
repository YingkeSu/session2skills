import type {
  LLMTrace,
  NormalizedSession,
  PreferenceProfile,
  ProfileV2,
  RunManifest,
} from "../normalize/models.js";
import type { ClaimManifest, SkepticReport, VerifierReport } from "../harness/types.js";
import { sanitizePersistedTraces } from "../llm/trace.js";
import { stringifyRedactedJson } from "../shared/redaction.js";
import { writeDirectoryArtifacts } from "./staged-directory-write.js";

export async function writeRunArtifacts(input: {
  outputDirectory: string;
  normalizedSessions: Array<NormalizedSession>;
  profile: PreferenceProfile;
  force: boolean;
}): Promise<{
  normalizedPath: string;
  profilePath: string;
}> {
  const paths = await writeDirectoryArtifacts({
    outputDirectory: input.outputDirectory,
    force: input.force,
    files: {
      "normalized.json": stringifyRedactedJson(input.normalizedSessions),
      "profile.json": stringifyRedactedJson(input.profile),
    },
  });

  return {
    normalizedPath: paths["normalized.json"]!,
    profilePath: paths["profile.json"]!,
  };
}

export async function writeHybridRunArtifacts(input: {
  outputDirectory: string;
  normalizedSessions: Array<NormalizedSession>;
  profile: PreferenceProfile | ProfileV2;
  evidenceIndex: unknown;
  ruleClaims: unknown;
  llmSessionClaims: unknown;
  llmCategoryClaims: unknown;
  mergedClaims: unknown;
  skillPlan: unknown;
  llmTraces: Array<LLMTrace>;
  manifest: RunManifest;
  force: boolean;
}): Promise<{
  normalizedPath: string;
  profilePath: string;
  evidenceIndexPath: string;
  ruleClaimsPath: string;
  llmSessionClaimsPath: string;
  llmCategoryClaimsPath: string;
  mergedClaimsPath: string;
  skillPlanPath: string;
  llmTracesPath: string;
  manifestPath: string;
}> {
  const paths = await writeDirectoryArtifacts({
    outputDirectory: input.outputDirectory,
    force: input.force,
    files: {
      "normalized.json": stringifyRedactedJson(input.normalizedSessions),
      "profile.json": stringifyRedactedJson(input.profile),
      "evidence-index.json": stringifyRedactedJson(input.evidenceIndex),
      "rule-claims.json": stringifyRedactedJson(input.ruleClaims),
      "llm-session-claims.json": stringifyRedactedJson(input.llmSessionClaims),
      "llm-category-claims.json": stringifyRedactedJson(input.llmCategoryClaims),
      "merged-claims.json": stringifyRedactedJson(input.mergedClaims),
      "skill-plan.json": stringifyRedactedJson(input.skillPlan),
      "llm-traces.json": stringifyRedactedJson(sanitizePersistedTraces(input.llmTraces)),
      "manifest.json": stringifyRedactedJson(input.manifest),
    },
  });

  return {
    normalizedPath: paths["normalized.json"]!,
    profilePath: paths["profile.json"]!,
    evidenceIndexPath: paths["evidence-index.json"]!,
    ruleClaimsPath: paths["rule-claims.json"]!,
    llmSessionClaimsPath: paths["llm-session-claims.json"]!,
    llmCategoryClaimsPath: paths["llm-category-claims.json"]!,
    mergedClaimsPath: paths["merged-claims.json"]!,
    skillPlanPath: paths["skill-plan.json"]!,
    llmTracesPath: paths["llm-traces.json"]!,
    manifestPath: paths["manifest.json"]!,
  };
}

export async function writeHarnessRunArtifacts(input: {
  outputDirectory: string;
  normalizedSessions: Array<NormalizedSession>;
  profile: ProfileV2;
  evidenceIndex: unknown;
  ruleClaims: unknown;
  claimManifest: ClaimManifest;
  skepticReport: SkepticReport;
  verifierReport: VerifierReport;
  llmTraces: Array<LLMTrace>;
  manifest: RunManifest;
  force: boolean;
}): Promise<{
  normalizedPath: string;
  profilePath: string;
  evidenceIndexPath: string;
  ruleClaimsPath: string;
  claimManifestPath: string;
  skepticReportPath: string;
  verifierReportPath: string;
  llmTracesPath: string;
  manifestPath: string;
}> {
  const paths = await writeDirectoryArtifacts({
    outputDirectory: input.outputDirectory,
    force: input.force,
    files: {
      "normalized.json": stringifyRedactedJson(input.normalizedSessions),
      "profile.json": stringifyRedactedJson(input.profile),
      "evidence-index.json": stringifyRedactedJson(input.evidenceIndex),
      "rule-claims.json": stringifyRedactedJson(input.ruleClaims),
      "claim-manifest.json": stringifyRedactedJson(input.claimManifest),
      "skeptic-report.json": stringifyRedactedJson(input.skepticReport),
      "verifier-report.json": stringifyRedactedJson(input.verifierReport),
      "llm-traces.json": stringifyRedactedJson(sanitizePersistedTraces(input.llmTraces)),
      "manifest.json": stringifyRedactedJson(input.manifest),
    },
  });

  return {
    normalizedPath: paths["normalized.json"]!,
    profilePath: paths["profile.json"]!,
    evidenceIndexPath: paths["evidence-index.json"]!,
    ruleClaimsPath: paths["rule-claims.json"]!,
    claimManifestPath: paths["claim-manifest.json"]!,
    skepticReportPath: paths["skeptic-report.json"]!,
    verifierReportPath: paths["verifier-report.json"]!,
    llmTracesPath: paths["llm-traces.json"]!,
    manifestPath: paths["manifest.json"]!,
  };
}
