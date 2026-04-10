import { writeDirectoryArtifacts } from "./staged-directory-write.js";

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
