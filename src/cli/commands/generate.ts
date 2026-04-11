import { Command } from "commander";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { buildSkillPlan } from "../../generate/skill-plan.js";
import { analyzeRecentSessions, analyzeWithLLM } from "../../analyze/run-analysis.js";
import { renderSkill, renderSkillArtifact } from "../../generate/render-skill.js";
import { renderSummary } from "../../generate/render-summary.js";
import { LlmProviderRegistry, OpenAiCompatibleProvider, createPromptRegistry } from "../../llm/index.js";
import { allPrompts } from "../../llm/prompts/index.js";
import type { MergedClaim, ProfileV2, SkillPlan } from "../../normalize/models.js";
import { writeGeneratedArtifacts, writeHybridGeneratedArtifacts } from "../../persist/generated-artifacts.js";
import { parsePositiveInteger, parseTonePreset, type TonePreset } from "../../shared/cli.js";
import { CliUsageError } from "../../shared/errors.js";
import { loadProfileFromFile } from "../../shared/profile-io.js";
import { resolveGeneratedSkillsDirectory, resolveProjectDirectory } from "../../shared/paths.js";

type GenerateOptions = {
  directory?: string;
  workspace?: string;
  recent: number;
  output?: string;
  force: boolean;
  profile?: string;
  tone: TonePreset;
  hybrid: boolean;
};

const HYBRID_LLM_PROVIDER = "openai-compatible";

export function registerGenerateCommand(program: Command): void {
  program
    .command("generate")
    .description("Generate summary and SKILL markdown artifacts from OpenCode sessions")
    .option("-d, --directory <path>", "Target project directory")
    .option("-w, --workspace <id>", "Optional OpenCode workspace id")
    .option("-r, --recent <number>", "Number of recent sessions to analyze", parsePositiveInteger, 10)
    .option("-o, --output <path>", "Directory where generated skill artifacts should be written")
    .option("-p, --profile <path>", "Use an existing profile.json file instead of live analysis")
    .option("--hybrid", "Run hybrid LLM analysis for live generation or compose from a hybrid profile", false)
    .option("--tone <preset>", "Output tone: concise, balanced, or detailed", parseTonePreset, "balanced")
    .option("--force", "Allow overwriting existing generated outputs", false)
    .action(async (options: GenerateOptions) => {
      const directory = resolveProjectDirectory(options.directory);
      const outputDirectory = resolveGeneratedSkillsDirectory(directory, options.output);
      const source = await resolveGenerateSource(options, directory);

      if (!options.profile && source.normalizedSessions.length === 0) {
        console.log(`No OpenCode sessions found for ${directory}.`);
        return;
      }

      const summary = renderSummary(source.profile, { tone: options.tone });
      const skill = await renderGeneratedSkill(source, options.tone);

      console.log("--- summary preview ---");
      console.log(summary.split("\n").slice(0, options.tone === "detailed" ? 18 : 12).join("\n"));
      console.log("--- skill preview ---");
      console.log(skill.split("\n").slice(0, options.tone === "detailed" ? 18 : 12).join("\n"));

      if (source.mode === "hybrid") {
        const artifactPaths = await writeHybridGeneratedArtifacts({
          outputDirectory,
          summary,
          skill,
          mergedClaims: source.profile.mergedClaims,
          skillPlan: source.skillPlan,
          force: options.force,
        });

        console.log(
          JSON.stringify(
            {
              directory,
              workspace: options.workspace,
              recent: options.profile ? null : source.normalizedSessions.length,
              outputDirectory,
              mode: source.mode,
              artifacts: {
                summaryPath: artifactPaths.summaryPath,
                skillPath: artifactPaths.skillPath,
                mergedClaimsPath: artifactPaths.mergedClaimsPath,
                skillPlanPath: artifactPaths.skillPlanPath,
              },
              profileSource: options.profile ? path.resolve(options.profile) : "live-hybrid-analysis",
              warnings: source.warnings,
              tone: options.tone,
              force: options.force,
              skillRenderer: source.skillRenderer,
              manifestPath: source.manifestPath,
            },
            null,
            2,
          ),
        );
        return;
      }

      const artifactPaths = await writeGeneratedArtifacts({
        outputDirectory,
        summary,
        skill,
        force: options.force,
      });

      console.log(
        JSON.stringify(
          {
            directory,
            workspace: options.workspace,
            recent: options.profile ? null : source.normalizedSessions.length,
            outputDirectory,
            mode: source.mode,
            artifacts: {
              summaryPath: artifactPaths.summaryPath,
              skillPath: artifactPaths.skillPath,
            },
            profileSource: options.profile ? path.resolve(options.profile) : "live-analysis",
            warnings: source.warnings,
            tone: options.tone,
            force: options.force,
            skillRenderer: source.skillRenderer,
            manifestPath: source.manifestPath,
          },
          null,
          2,
        ),
      );
    });
}

type LegacyGenerateSource = {
  mode: "legacy";
  profile: Awaited<ReturnType<typeof loadProfileFromFile>>;
  normalizedSessions: Awaited<ReturnType<typeof analyzeRecentSessions>>["normalizedSessions"];
  warnings: Array<string | { type: string; message: string; sessionID?: string }>;
  skillRenderer: "fallback";
  manifestPath: null;
};

type HybridGenerateSource = {
  mode: "hybrid";
  profile: ProfileV2;
  normalizedSessions: Awaited<ReturnType<typeof analyzeRecentSessions>>["normalizedSessions"];
  warnings: Array<string | { type: string; message: string; sessionID?: string }>;
  skillPlan: SkillPlan;
  skillMarkdown?: string;
  skillRenderer: "llm" | "fallback";
  manifestPath: string | null;
};

async function resolveGenerateSource(options: GenerateOptions, directory: string): Promise<LegacyGenerateSource | HybridGenerateSource> {
  if (options.profile) {
    const profilePath = path.resolve(options.profile);
    const profile = await loadProfileFromFile(profilePath);

    if (isProfileV2(profile)) {
      return {
        mode: "hybrid",
        profile,
        normalizedSessions: [],
        warnings: [],
        skillPlan: await loadOrBuildHybridSkillPlan(profilePath, profile),
        skillRenderer: "llm",
        manifestPath: await findSiblingArtifact(profilePath, "manifest.json"),
      };
    }

    if (options.hybrid) {
      throw new CliUsageError("--hybrid with --profile requires a hybrid profile/v2 artifact.");
    }

    return {
      mode: "legacy",
      profile,
      normalizedSessions: [],
      warnings: [],
      skillRenderer: "fallback",
      manifestPath: null,
    };
  }

  if (!options.hybrid) {
    const analysis = await analyzeRecentSessions({
      directory,
      workspace: options.workspace,
      recent: options.recent,
      tone: options.tone,
    });

    return {
      mode: "legacy",
      profile: analysis.profile,
      normalizedSessions: analysis.normalizedSessions,
      warnings: analysis.warnings,
      skillRenderer: "fallback",
      manifestPath: null,
    };
  }

  const resolved = resolveHybridLlmProvider();
  const registry = buildPromptRegistry();
  const analysis = await analyzeWithLLM(
    {
      directory,
      workspace: options.workspace,
      recent: options.recent,
      tone: options.tone,
    },
    { resolved, registry },
    { resolved, registry },
  );

  return {
    mode: "hybrid",
    profile: analysis.profile,
    normalizedSessions: analysis.normalizedSessions,
    warnings: analysis.warnings,
    skillPlan: analysis.skillPlan,
    skillMarkdown: analysis.skill,
    skillRenderer: analysis.skillRenderMode,
    manifestPath: null,
  };
}

async function renderGeneratedSkill(source: LegacyGenerateSource | HybridGenerateSource, tone: TonePreset): Promise<string> {
  if (source.mode === "legacy") {
    return renderSkill(source.profile, tone);
  }

  if (source.skillMarkdown) {
    return source.skillMarkdown;
  }

  const rendered = await renderSkillArtifact(source.profile, tone, {
    skillPlan: source.skillPlan,
    llmClient: resolveHybridLlmProvider(),
  });

  source.skillRenderer = rendered.renderer;
  return rendered.markdown;
}

function resolveHybridLlmProvider() {
  const baseUrl = process.env.SESSION2SKILLS_LLM_BASE_URL;
  const model = process.env.SESSION2SKILLS_LLM_MODEL;

  if (!baseUrl || !model) {
    throw new CliUsageError(
      "Hybrid generation requires SESSION2SKILLS_LLM_BASE_URL and SESSION2SKILLS_LLM_MODEL environment variables.",
    );
  }

  const providerName = process.env.SESSION2SKILLS_LLM_PROVIDER ?? HYBRID_LLM_PROVIDER;
  const preferJsonObject = providerName === "deepseek" || providerName === "zhipuai";

  const provider = new OpenAiCompatibleProvider({
    provider: providerName,
    baseUrl,
    apiKey: process.env.SESSION2SKILLS_LLM_API_KEY,
    defaultModel: {
      model,
      version: process.env.SESSION2SKILLS_LLM_MODEL_VERSION,
    },
    preferJsonObject,
  });

  return new LlmProviderRegistry([{ provider }]).resolve(provider.provider);
}

function buildPromptRegistry() {
  const registry = createPromptRegistry();

  for (const prompt of allPrompts) {
    registry.register(prompt);
  }

  return registry;
}

function isProfileV2(profile: Awaited<ReturnType<typeof loadProfileFromFile>>): profile is ProfileV2 {
  return "schemaVersion" in profile && profile.schemaVersion === "profile/v2";
}

async function loadOrBuildHybridSkillPlan(profilePath: string, profile: ProfileV2): Promise<SkillPlan> {
  const skillPlanPath = await findSiblingArtifact(profilePath, "skill-plan.json");

  if (skillPlanPath) {
    const raw = await readFile(skillPlanPath, "utf8");
    return JSON.parse(raw) as SkillPlan;
  }

  return buildSkillPlan(
    profile.mergedClaims
      .filter((claim) => isAcceptedClaim(profile, claim))
      .map((claim) => toRankedMergedClaim(claim, "accepted")),
    profile.mergedClaims
      .filter((claim) => !isAcceptedClaim(profile, claim) && isTentativeClaim(profile, claim))
      .map((claim) => toRankedMergedClaim(claim, "tentative")),
    {
      promptSetVersion: profile.promptSetVersion,
    },
  );
}

async function findSiblingArtifact(profilePath: string, fileName: string): Promise<string | null> {
  const artifactPath = path.join(path.dirname(profilePath), fileName);

  try {
    await readFile(artifactPath, "utf8");
    return artifactPath;
  } catch {
    return null;
  }
}

function isAcceptedClaim(profile: ProfileV2, claim: MergedClaim): boolean {
  return profile.acceptedClaims.some((candidate) => candidate.claimID === claim.claimID);
}

function isTentativeClaim(profile: ProfileV2, claim: MergedClaim): boolean {
  return profile.tentativeClaims.some((candidate) => candidate.claimID === claim.claimID);
}

function toRankedMergedClaim(claim: MergedClaim, status: "accepted" | "tentative") {
  return {
    ...claim,
    status,
    normalizedLabel: String(claim.label),
    evidenceCount: claim.citations.length,
    sessionIDs: [...new Set(claim.citations.map((citation) => citation.sessionID))].sort(),
    sourceClaimIDs: claim.sources.map((source) => source.claimID).sort(),
    sourceTypes: [...new Set(claim.sources.map((source) => source.source.type))].sort(),
    agreementBonus: 0,
    sessionCoverageBonus: 0,
    contradictionPenalty: 0,
    contradictions: [],
  };
}
