import type {
  LLMTrace,
  NormalizedSession,
  PreferenceProfile,
  ProfileV2,
  RunManifest,
} from "../normalize/models.js";
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
      "normalized.json": JSON.stringify(input.normalizedSessions, null, 2),
      "profile.json": JSON.stringify(input.profile, null, 2),
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
      "normalized.json": JSON.stringify(input.normalizedSessions, null, 2),
      "profile.json": JSON.stringify(input.profile, null, 2),
      "evidence-index.json": JSON.stringify(input.evidenceIndex, null, 2),
      "rule-claims.json": JSON.stringify(input.ruleClaims, null, 2),
      "llm-session-claims.json": JSON.stringify(input.llmSessionClaims, null, 2),
      "llm-category-claims.json": JSON.stringify(input.llmCategoryClaims, null, 2),
      "merged-claims.json": JSON.stringify(input.mergedClaims, null, 2),
      "skill-plan.json": JSON.stringify(input.skillPlan, null, 2),
      "llm-traces.json": JSON.stringify(input.llmTraces, null, 2),
      "manifest.json": JSON.stringify(input.manifest, null, 2),
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
