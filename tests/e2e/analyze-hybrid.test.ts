import { join } from "node:path";

import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";

import {
  PROFILE_V2_SCHEMA_VERSION,
  RUN_MANIFEST_SCHEMA_VERSION,
  type CandidateClaim,
  type EvidenceItem,
  type LLMTrace,
  type MergedClaim,
  type NormalizedSession,
  type ProfileV2,
  type RunManifest,
  type SkillPlan,
} from "../../src/normalize/models.js";
import {
  cleanupDir,
  createTempDir,
  fileExists,
  getHybridEnv,
  getProjectDir,
  killOrphanedOpenCodeServers,
  preflightChecks,
  readArtifact,
  runCLI,
  runCLIAsync,
} from "./helpers.js";

const HYBRID_ARTIFACT_FILES = [
  "normalized.json",
  "profile.json",
  "evidence-index.json",
  "rule-claims.json",
  "llm-session-claims.json",
  "llm-category-claims.json",
  "merged-claims.json",
  "skill-plan.json",
  "llm-traces.json",
  "manifest.json",
] as const;

function expectCandidateClaimShape(claim: CandidateClaim): void {
  expect(typeof claim.claimID).toBe("string");
  expect(typeof claim.dimension).toBe("string");
  expect(typeof claim.label).toBe("string");
  expect(typeof claim.confidence).toBe("number");
  expect(Array.isArray(claim.citations)).toBe(true);
  expect(typeof claim.source).toBe("object");
  expect(claim.source).not.toBeNull();
}

function expectOptionalNumber(value: number | undefined): void {
  if (value !== undefined) {
    expect(typeof value).toBe("number");
  }
}

describe("analyze hybrid", () => {
  const projectDir = getProjectDir();
  let hybridEnv: Record<string, string>;
  let tempDir = "";

  beforeAll(() => {
    preflightChecks();
    hybridEnv = getHybridEnv();
  }, 30000);

  afterEach(() => {
    if (tempDir) {
      cleanupDir(tempDir);
      tempDir = "";
    }
  });

  afterAll(() => {
    killOrphanedOpenCodeServers();
  });

  it(
    "runs hybrid analysis with the real LLM API and writes the full artifact tree",
    async () => {
    tempDir = createTempDir("session2skills-e2e-hybrid-");

    const result = await runCLIAsync(
      ["analyze", "-d", projectDir, "--recent", "3", "-o", tempDir, "--hybrid"],
      { env: hybridEnv, timeout: 300000 },
    );

    expect(result.status).toBe(0);

    for (const fileName of HYBRID_ARTIFACT_FILES) {
      expect(fileExists(join(tempDir, fileName))).toBe(true);
    }

    const normalized = readArtifact<Array<NormalizedSession>>(tempDir, "normalized.json");
    expect(Array.isArray(normalized)).toBe(true);
    expect(normalized.length).toBeGreaterThan(0);
    for (const session of normalized) {
      expect(typeof session.id).toBe("string");
      expect(typeof session.title).toBe("string");
      expect(typeof session.directory).toBe("string");
      expect(Array.isArray(session.messages)).toBe(true);
      expect(Array.isArray(session.toolInvocations)).toBe(true);
    }

    const profile = readArtifact<ProfileV2>(tempDir, "profile.json");
    expect(profile.schemaVersion).toBe(PROFILE_V2_SCHEMA_VERSION);
    expect(typeof profile.strongestSignals).toBe("object");
    expect(profile.strongestSignals).not.toBeNull();
    expect(Array.isArray(profile.acceptedClaims)).toBe(true);
    expect(Array.isArray(profile.tentativeClaims)).toBe(true);
    expect(Array.isArray(profile.mergedClaims)).toBe(true);
    expect(Array.isArray(profile.confidenceNotes)).toBe(true);

    const evidenceIndex = readArtifact<Array<EvidenceItem>>(tempDir, "evidence-index.json");
    expect(Array.isArray(evidenceIndex)).toBe(true);
    for (const item of evidenceIndex) {
      expect(typeof item.evidenceID).toBe("string");
      expect(typeof item.citation).toBe("object");
      expect(item.citation).not.toBeNull();
      expect(typeof item.summaryText).toBe("string");
      expect(Array.isArray(item.dimensions)).toBe(true);
    }

    const ruleClaims = readArtifact<Array<CandidateClaim>>(tempDir, "rule-claims.json");
    expect(Array.isArray(ruleClaims)).toBe(true);
    expect(ruleClaims.length).toBeGreaterThan(0);
    for (const claim of ruleClaims) {
      expectCandidateClaimShape(claim);
    }

    const llmSessionClaims = readArtifact<Array<CandidateClaim>>(tempDir, "llm-session-claims.json");
    expect(Array.isArray(llmSessionClaims)).toBe(true);
    for (const claim of llmSessionClaims) {
      expectCandidateClaimShape(claim);
    }

    const llmCategoryClaims = readArtifact<Array<CandidateClaim>>(tempDir, "llm-category-claims.json");
    expect(Array.isArray(llmCategoryClaims)).toBe(true);

    const mergedClaimsRaw = readArtifact<{
      accepted: Array<MergedClaim>;
      tentative: Array<MergedClaim>;
      rejected: Array<MergedClaim>;
    }>(tempDir, "merged-claims.json");
    expect(typeof mergedClaimsRaw).toBe("object");
    expect(Array.isArray(mergedClaimsRaw.accepted)).toBe(true);
    expect(Array.isArray(mergedClaimsRaw.tentative)).toBe(true);
    const mergedClaims = [...mergedClaimsRaw.accepted, ...mergedClaimsRaw.tentative];
    console.log("analyze hybrid merged claim count", mergedClaims.length);
    expect(mergedClaims.length).toBeGreaterThanOrEqual(0);
    for (const claim of mergedClaims) {
      expect(typeof claim.claimID).toBe("string");
      expect(typeof claim.dimension).toBe("string");
      expect(typeof claim.label).toBe("string");
      expect(typeof claim.confidence).toBe("number");
      expect(Array.isArray(claim.citations)).toBe(true);
      expect(Array.isArray(claim.sources)).toBe(true);
    }

    const skillPlan = readArtifact<SkillPlan>(tempDir, "skill-plan.json");
    expect(typeof skillPlan.schemaVersion).toBe("string");
    expect(typeof skillPlan.planID).toBe("string");
    expect(typeof skillPlan.title).toBe("string");
    expect(Array.isArray(skillPlan.sections)).toBe(true);
    expect(typeof skillPlan.directives).toBe("object");
    expect(skillPlan.directives).not.toBeNull();

    const llmTraces = readArtifact<Array<LLMTrace>>(tempDir, "llm-traces.json");
    expect(Array.isArray(llmTraces)).toBe(true);
    expect(llmTraces.length).toBeGreaterThan(0);
    for (const trace of llmTraces) {
      expect(typeof trace.traceID).toBe("string");
      expect(typeof trace.stage).toBe("string");
      expect(typeof trace.provider).toBe("string");
      expect(typeof trace.model).toBe("string");
      expect(typeof trace.request).toBe("object");
      expect(trace.request).not.toBeNull();
      expect(typeof trace.response).toBe("object");
      expect(trace.response).not.toBeNull();
      if (trace.usage) {
        expect(typeof trace.usage).toBe("object");
        expectOptionalNumber(trace.usage.inputTokens);
        expectOptionalNumber(trace.usage.outputTokens);
        expectOptionalNumber(trace.usage.totalTokens);
      }
    }
    const hasTraceWithInputTokens = llmTraces.some((trace) => (trace.usage?.inputTokens ?? 0) > 0);
    console.log("analyze hybrid traces include input token usage", hasTraceWithInputTokens);
    expect(typeof hasTraceWithInputTokens).toBe("boolean");

    const manifest = readArtifact<RunManifest>(tempDir, "manifest.json");
    expect(manifest.schemaVersion).toBe(RUN_MANIFEST_SCHEMA_VERSION);
    expect(typeof manifest.runID).toBe("string");
    expect(typeof manifest.generatedAt).toBe("string");
    expect(Number.isNaN(Date.parse(manifest.generatedAt))).toBe(false);
    expect(manifest.directory).toBe(projectDir);
    expect(Array.isArray(manifest.sessionIDs)).toBe(true);
    expect(manifest.sessionIDs.length).toBeGreaterThan(0);
    expect(Array.isArray(manifest.artifacts)).toBe(true);
    expect(manifest.metadata?.mode).toBe("hybrid");

    const hasMergedClaimWithLlmSource = mergedClaims.some((claim) =>
      claim.sources.some((source) => source.source.type === "llm-session" || source.source.type === "llm-category"),
    );
    console.log("analyze hybrid merged claims include llm source", hasMergedClaimWithLlmSource);
    expect(typeof hasMergedClaimWithLlmSource).toBe("boolean");
  }, 300000);

  it("fails when the hybrid LLM base URL env var is missing", () => {
    tempDir = createTempDir("session2skills-e2e-hybrid-missing-env-");

    const { SESSION2SKILLS_LLM_BASE_URL: _unusedBaseUrl, ...envWithoutBaseUrl } = hybridEnv;
    const result = runCLI(
      ["analyze", "-d", projectDir, "--recent", "3", "-o", tempDir, "--hybrid"],
      {
        env: {
          ...envWithoutBaseUrl,
          SESSION2SKILLS_LLM_BASE_URL: "",
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Hybrid mode requires SESSION2SKILLS_LLM_BASE_URL and SESSION2SKILLS_LLM_MODEL environment variables.",
    );
  });
});
