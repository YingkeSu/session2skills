import { Command } from "commander";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { buildSkillPlan } from "../../generate/skill-plan.js";
import { analyzeRecentSessions, analyzeWithLLM } from "../../analyze/run-analysis.js";
import { renderSkill, renderSkillArtifact } from "../../generate/render-skill.js";
import { renderSummary } from "../../generate/render-summary.js";
import { LlmProviderRegistry, OpenAiCompatibleProvider, createPromptRegistry } from "../../llm/index.js";
import { allPrompts } from "../../llm/prompts/index.js";
import type { MergedClaim, ProfileV2, SkillPlan } from "../../normalize/models.js";
import { writeGeneratedArtifacts, writeHybridGeneratedArtifacts, writeHarnessGeneratedArtifacts } from "../../persist/generated-artifacts.js";
import { parsePositiveInteger, parseTonePreset, type TonePreset } from "../../shared/cli.js";
import { CliUsageError, HYBRID_LLM_ENV_REQUIRED } from "../../shared/errors.js";
import { loadProfileFromFile } from "../../shared/profile-io.js";
import { resolveGeneratedSkillsDirectory, resolveProjectDirectory, validateProjectDirectory } from "../../shared/paths.js";
import { analyzeWithHarness } from "../../harness/run-harness.js";
import { buildEvidenceIndex } from "../../analyze/evidence-index.js";
import { extractAllRuleClaims, buildProfileV2 } from "../../profile/build-profile.js";
import { enrichManifestWithEvidence } from "../../harness/enrich-evidence.js";

type GenerateOptions = {
  directory?: string;
  workspace?: string;
  recent: number;
  output?: string;
  force: boolean;
  profile?: string;
  tone: TonePreset;
  hybrid: boolean;
  harness: boolean;
};

const HYBRID_LLM_PROVIDER = "openai-compatible";

const HYBRID_DEPRECATION_WARNING =
  "Warning: --hybrid is deprecated. Harness mode is the default when LLM env vars are set.\n";

function hasLlmEnvVars(): boolean {
  return Boolean(process.env.SESSION2SKILLS_LLM_BASE_URL) && Boolean(process.env.SESSION2SKILLS_LLM_MODEL);
}

export function registerGenerateCommand(program: Command): void {
  program
    .command("generate")
    .description("Generate summary and SKILL markdown artifacts from OpenCode sessions")
    .option("-d, --directory <path>", "Target project directory")
    .option("-w, --workspace <id>", "Optional OpenCode workspace id")
    .option("-r, --recent <number>", "Number of recent sessions to analyze", parsePositiveInteger, 10)
    .option("-o, --output <path>", "Directory where generated skill artifacts should be written")
    .option("-p, --profile <path>", "Use an existing profile.json file or analyze output directory instead of live analysis")
    .option("--hybrid", "Run hybrid LLM analysis for live generation or compose from a hybrid profile", false)
    .option("--harness", "Run harness-inspired multi-stage LLM pipeline for skill generation", false)
    .option("--tone <preset>", "Output tone: concise, balanced, or detailed", parseTonePreset, "balanced")
    .option("--force", "Allow overwriting existing generated outputs", false)
    .action(async (options: GenerateOptions) => {
      if (options.hybrid && options.harness) {
        throw new CliUsageError("Cannot use --hybrid and --harness together. Choose one mode.");
      }

      if (options.hybrid) {
        process.stderr.write(HYBRID_DEPRECATION_WARNING);
      }

      const directory = validateProjectDirectory(resolveProjectDirectory(options.directory));
      const outputDirectory = resolveGeneratedSkillsDirectory(directory, options.output);
      const source = await resolveGenerateSource(options, directory);

      if (!options.profile && !options.harness && source.normalizedSessions.length === 0) {
        console.log(`No OpenCode sessions found for ${directory}.`);
        return;
      }

      if (source.mode === "harness") {
        const summary = renderSummary(source.profile, { tone: options.tone });
        const skill = source.harnessResult.writerOutput.skillMarkdown;

        console.log("--- summary preview ---");
        console.log(summary.split("\n").slice(0, 12).join("\n"));
        console.log("--- skill preview ---");
        console.log(skill.split("\n").slice(0, 18).join("\n"));

        const artifactPaths = await writeHarnessGeneratedArtifacts({
          outputDirectory,
          summary,
          skill,
          claimManifest: source.harnessResult.revisedManifest,
          skepticReport: source.harnessResult.skepticReport,
          verifierReport: source.harnessResult.verifierReport,
          traces: source.harnessResult.traces,
          force: options.force,
        });

        console.log(
          JSON.stringify(
            {
              directory,
              workspace: options.workspace,
              recent: source.normalizedSessions.length,
              outputDirectory,
              mode: "harness",
              artifacts: {
                summaryPath: artifactPaths.summaryPath,
                skillPath: artifactPaths.skillPath,
                claimManifestPath: artifactPaths.claimManifestPath,
                skepticReportPath: artifactPaths.skepticReportPath,
                verifierReportPath: artifactPaths.verifierReportPath,
              },
              verifierPassed: source.harnessResult.verifierReport.pass,
              manifestClaims: source.harnessResult.revisedManifest.claims.length,
              skepticIssues: source.harnessResult.skepticReport.issues.length,
              tone: options.tone,
              force: options.force,
            },
            null,
            2,
          ),
        );
        return;
      }

      const legacyOrHybridSource = source as LegacyGenerateSource | HybridGenerateSource;
      const summary = renderSummary(legacyOrHybridSource.profile, { tone: options.tone });
      const skill = await renderGeneratedSkill(legacyOrHybridSource, options.tone);

      console.log("--- summary preview ---");
      console.log(summary.split("\n").slice(0, options.tone === "detailed" ? 18 : 12).join("\n"));
      console.log("--- skill preview ---");
      console.log(skill.split("\n").slice(0, options.tone === "detailed" ? 18 : 12).join("\n"));

      if (legacyOrHybridSource.mode === "hybrid") {
        const artifactPaths = await writeHybridGeneratedArtifacts({
          outputDirectory,
          summary,
          skill,
          mergedClaims: legacyOrHybridSource.profile.mergedClaims,
          skillPlan: legacyOrHybridSource.skillPlan,
          force: options.force,
        });

        console.log(
          JSON.stringify(
            {
              directory,
              workspace: options.workspace,
              recent: options.profile ? null : legacyOrHybridSource.normalizedSessions.length,
              outputDirectory,
              mode: legacyOrHybridSource.mode,
              artifacts: {
                summaryPath: artifactPaths.summaryPath,
                skillPath: artifactPaths.skillPath,
                mergedClaimsPath: artifactPaths.mergedClaimsPath,
                skillPlanPath: artifactPaths.skillPlanPath,
              },
              profileSource: describeProfileSource(legacyOrHybridSource),
              warnings: legacyOrHybridSource.warnings,
              tone: options.tone,
              force: options.force,
              skillRenderer: legacyOrHybridSource.skillRenderer,
              manifestPath: legacyOrHybridSource.manifestPath,
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
            recent: options.profile ? null : legacyOrHybridSource.normalizedSessions.length,
            outputDirectory,
            mode: legacyOrHybridSource.mode,
            artifacts: {
              summaryPath: artifactPaths.summaryPath,
              skillPath: artifactPaths.skillPath,
            },
            profileSource: describeProfileSource(legacyOrHybridSource),
            warnings: legacyOrHybridSource.warnings,
            tone: options.tone,
            force: options.force,
            skillRenderer: legacyOrHybridSource.skillRenderer,
            manifestPath: legacyOrHybridSource.manifestPath,
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
  profileSourcePath?: string;
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
  profileSourcePath?: string;
};

type HarnessGenerateSource = {
  mode: "harness";
  profile: ProfileV2;
  normalizedSessions: Awaited<ReturnType<typeof analyzeRecentSessions>>["normalizedSessions"];
  harnessResult: Awaited<ReturnType<typeof analyzeWithHarness>>;
  warnings: Array<string>;
};

async function resolveGenerateSource(options: GenerateOptions, directory: string): Promise<LegacyGenerateSource | HybridGenerateSource | HarnessGenerateSource> {
  if (options.profile) {
    const profilePath = await resolveProfileInputPath(options.profile);
    const profile = await loadProfileFromFile(profilePath);

    if (isProfileV2(profile)) {
      return {
        mode: "hybrid",
        profile,
        normalizedSessions: [],
        warnings: [],
        skillPlan: await loadOrBuildHybridSkillPlan(profilePath, profile),
        skillRenderer: "fallback",
        manifestPath: await findSiblingArtifact(profilePath, "manifest.json"),
        profileSourcePath: profilePath,
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
      profileSourcePath: profilePath,
    };
  }

  if (options.harness || (!options.hybrid && hasLlmEnvVars())) {
    const resolved = resolveHybridLlmProvider();
    const registry = buildPromptRegistry();

    const analysis = await analyzeRecentSessions({
      directory,
      workspace: options.workspace,
      recent: options.recent,
      tone: options.tone,
    });

    if (analysis.normalizedSessions.length === 0) {
      return {
        mode: "harness" as const,
        profile: analysis.profile,
        normalizedSessions: [],
        harnessResult: {
          manifest: { schemaVersion: "claim-manifest/v1" as const, claims: [], evidenceSummary: "", dimensionsCovered: [], metadata: { generatedAt: new Date().toISOString(), sessionCount: 0, totalEvidenceItems: 0 } },
          skepticReport: { schemaVersion: "skeptic-report/v1" as const, issues: [], overallScore: 1, metadata: { generatedAt: new Date().toISOString(), claimCount: 0, issueCount: 0 } },
          writerOutput: { skillMarkdown: "# No sessions found\n", sections: [] },
          verifierReport: { schemaVersion: "verifier-report/v1" as const, pass: true, checkedItems: [], issues: [], metadata: { generatedAt: new Date().toISOString(), directiveCount: 0, verifiedCount: 0, fabricatedCount: 0 } },
          revisedManifest: { schemaVersion: "claim-manifest/v1" as const, claims: [], evidenceSummary: "", dimensionsCovered: [], metadata: { generatedAt: new Date().toISOString(), sessionCount: 0, totalEvidenceItems: 0 } },
          traces: [],
        },
        warnings: [],
      };
    }

    const evidenceIndex = buildEvidenceIndex(analysis.normalizedSessions);
    const ruleClaims = extractAllRuleClaims(analysis.normalizedSessions);
    const harnessResult = await analyzeWithHarness({
      sessions: analysis.normalizedSessions,
      evidence: evidenceIndex,
      provider: resolved,
      registry,
      tone: options.tone,
    });

    const profile = buildProfileV2([], {
      confidenceNotes: [
        ...analysis.profile.confidenceNotes,
        `harness pipeline: ${harnessResult.revisedManifest.claims.length} claims extracted across ${harnessResult.revisedManifest.dimensionsCovered.length} dimensions`,
        `skeptic: ${harnessResult.skepticReport.issues.length} issues found (score: ${harnessResult.skepticReport.overallScore.toFixed(2)})`,
        `verifier: ${harnessResult.verifierReport.pass ? "PASSED" : "FAILED"}`,
      ],
    });

    const selfContainedManifest = enrichManifestWithEvidence(
      harnessResult.revisedManifest,
      evidenceIndex,
    );

    return {
      mode: "harness" as const,
      profile,
      normalizedSessions: analysis.normalizedSessions,
      harnessResult: { ...harnessResult, revisedManifest: selfContainedManifest },
      warnings: analysis.warnings.map((w) => w.message),
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

async function resolveProfileInputPath(inputPath: string): Promise<string> {
  const resolvedPath = path.resolve(inputPath);

  try {
    const stats = await stat(resolvedPath);
    if (stats.isDirectory()) {
      return path.join(resolvedPath, "profile.json");
    }
    return resolvedPath;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return resolvedPath;
    }
    throw new CliUsageError(`Cannot access profile path ${resolvedPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function describeProfileSource(source: LegacyGenerateSource | HybridGenerateSource): string {
  if (source.profileSourcePath) {
    return source.profileSourcePath;
  }

  return source.mode === "hybrid" ? "live-hybrid-analysis" : "live-analysis";
}

async function renderGeneratedSkill(source: LegacyGenerateSource | HybridGenerateSource, tone: TonePreset): Promise<string> {
  if (source.mode === "legacy") {
    return renderSkill(source.profile, tone);
  }

  if (source.skillMarkdown) {
    return source.skillMarkdown;
  }

  const llmClient = tryResolveHybridLlmProvider();
  const rendered = await renderSkillArtifact(source.profile, tone, {
    skillPlan: source.skillPlan,
    ...(llmClient ? { llmClient } : {}),
  });

  source.skillRenderer = rendered.renderer;
  return rendered.markdown;
}

function tryResolveHybridLlmProvider(): ReturnType<typeof resolveHybridLlmProvider> | undefined {
  if (!process.env.SESSION2SKILLS_LLM_BASE_URL || !process.env.SESSION2SKILLS_LLM_MODEL) {
    return undefined;
  }

  return resolveHybridLlmProvider();
}

function resolveHybridLlmProvider() {
  const baseUrl = process.env.SESSION2SKILLS_LLM_BASE_URL;
  const model = process.env.SESSION2SKILLS_LLM_MODEL;

  if (!baseUrl || !model) {
    throw new CliUsageError(
      HYBRID_LLM_ENV_REQUIRED,
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
    let raw: string;
    try {
      raw = await readFile(skillPlanPath, "utf8");
    } catch {
      throw new CliUsageError(`Skill plan file not found: ${skillPlanPath}`);
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new CliUsageError(`Invalid skill-plan file: ${skillPlanPath} — expected an object`);
      }
      if (typeof (parsed as Record<string, unknown>).schemaVersion !== "string") {
        throw new CliUsageError(`Invalid skill-plan file: ${skillPlanPath} — missing or invalid schemaVersion`);
      }
      if (!Array.isArray((parsed as Record<string, unknown>).sections)) {
        throw new CliUsageError(`Invalid skill-plan file: ${skillPlanPath} — missing or invalid sections`);
      }
      if (!isRecord((parsed as Record<string, unknown>).directives)) {
        throw new CliUsageError(`Invalid skill-plan file: ${skillPlanPath} — missing or invalid directives`);
      }
      if (!isRecord((parsed as Record<string, unknown>).fallbackDirectives)) {
        throw new CliUsageError(`Invalid skill-plan file: ${skillPlanPath} — missing or invalid fallbackDirectives`);
      }
      return parsed as SkillPlan;
    } catch (error) {
      if (error instanceof CliUsageError) throw error;
      throw new CliUsageError(`Invalid JSON in skill plan file ${skillPlanPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
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
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return null;
    }
    throw new CliUsageError(`Cannot read artifact ${artifactPath}: ${err instanceof Error ? err.message : String(err)}`);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
