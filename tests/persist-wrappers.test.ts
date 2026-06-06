import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { writeGeneratedArtifacts, writeHarnessGeneratedArtifacts, writeHybridGeneratedArtifacts } from "../src/persist/generated-artifacts.js";
import { writeRunArtifacts, writeHybridRunArtifacts } from "../src/persist/run-store.js";
import { CliUsageError } from "../src/shared/errors.js";
import type { LLMTrace, NormalizedSession, PreferenceProfile, RunManifest } from "../src/normalize/models.js";

async function tmpDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "session2skills-persist-"));
}

const MINIMAL_SESSION: NormalizedSession = {
  id: "ses_1",
  title: "test",
  directory: "/test",
  updatedAt: Date.now(),
  messages: [],
  toolInvocations: [],
  steps: [],
};

const MINIMAL_PROFILE: PreferenceProfile = {
  workStyle: [],
  communicationStyle: [],
  validationHabits: [],
  constraints: [],
  tokenEfficiency: [],
  modelSelection: [],
  delegationPattern: [],
  confidenceNotes: [],
};

const MINIMAL_MANIFEST: RunManifest = {
  schemaVersion: "run-manifest/v1" as const,
  runID: "run_1",
  generatedAt: new Date().toISOString(),
  directory: "/test",
  sessionIDs: [],
  promptSetVersion: "prompt-set/v1",
  artifacts: [],
  metadata: {
    mode: "hybrid",
  },
};

const TRACE_WITH_PRIVATE_CONTENT: LLMTrace = {
  schemaVersion: "llm-trace/v1",
  traceID: "trace_private",
  timestamp: new Date().toISOString(),
  promptSetVersion: "prompt-set/v1",
  stage: "session-claims",
  provider: "mock",
  model: "mock-model",
  request: {
    promptName: "extract-session-claims",
    messages: [
      { role: "system", content: "system prompt with private policy" },
      { role: "user", content: "SECRET_TOKEN=abc123\nsource code payload" },
    ],
  },
  response: {
    finishReason: "stop",
    rawText: "{\"private\":\"raw model output\"}",
    structuredOutput: { kind: "candidate-claims", claims: [] },
  },
};

const MINIMAL_CLAIM_MANIFEST = {
  schemaVersion: "claim-manifest/v1" as const,
  claims: [],
  evidenceSummary: "",
  dimensionsCovered: [],
  metadata: {
    generatedAt: new Date().toISOString(),
    sessionCount: 0,
    totalEvidenceItems: 0,
  },
};

const MINIMAL_SKEPTIC_REPORT = {
  schemaVersion: "skeptic-report/v1" as const,
  issues: [],
  overallScore: 1,
  metadata: {
    generatedAt: new Date().toISOString(),
    claimCount: 0,
    issueCount: 0,
  },
};

const MINIMAL_VERIFIER_REPORT = {
  schemaVersion: "verifier-report/v1" as const,
  pass: true,
  checkedItems: [],
  issues: [],
  metadata: {
    generatedAt: new Date().toISOString(),
    directiveCount: 0,
    verifiedCount: 0,
    fabricatedCount: 0,
  },
};

const VALID_SKILL = `---
name: workflow-style
description: Use when adapting to this user's observed coding workflow.
---

# Workflow Style
`;

describe("writeRunArtifacts", () => {
  it("writes normalized.json and profile.json", async () => {
    const dir = await tmpDir();
    const result = await writeRunArtifacts({
      outputDirectory: dir,
      normalizedSessions: [MINIMAL_SESSION],
      profile: MINIMAL_PROFILE,
      force: false,
    });

    expect(result.normalizedPath).toContain("normalized.json");
    expect(result.profilePath).toContain("profile.json");

    const normalized = JSON.parse(await readFile(result.normalizedPath, "utf8"));
    expect(normalized).toHaveLength(1);

    const profile = JSON.parse(await readFile(result.profilePath, "utf8"));
    expect(profile.workStyle).toBeDefined();
  });
});

describe("writeHybridRunArtifacts", () => {
  it("writes all 10 artifact files", async () => {
    const dir = await tmpDir();
    const result = await writeHybridRunArtifacts({
      outputDirectory: dir,
      normalizedSessions: [MINIMAL_SESSION],
      profile: MINIMAL_PROFILE,
      evidenceIndex: [{ summaryText: "OPENAI_API_KEY=sk-secretvalue" }],
      ruleClaims: [],
      llmSessionClaims: [],
      llmCategoryClaims: [],
      mergedClaims: [{ rationale: "OPENAI_API_KEY=sk-secretvalue" }],
      skillPlan: {},
      llmTraces: [],
      manifest: MINIMAL_MANIFEST,
      force: false,
    });

    expect(result.normalizedPath).toContain("normalized.json");
    expect(result.profilePath).toContain("profile.json");
    expect(result.evidenceIndexPath).toContain("evidence-index.json");
    expect(result.ruleClaimsPath).toContain("rule-claims.json");
    expect(result.llmSessionClaimsPath).toContain("llm-session-claims.json");
    expect(result.llmCategoryClaimsPath).toContain("llm-category-claims.json");
    expect(result.mergedClaimsPath).toContain("merged-claims.json");
    expect(result.skillPlanPath).toContain("skill-plan.json");
    expect(result.llmTracesPath).toContain("llm-traces.json");
    expect(result.manifestPath).toContain("manifest.json");

    const evidenceIndex = await readFile(result.evidenceIndexPath, "utf8");
    const mergedClaims = await readFile(result.mergedClaimsPath, "utf8");
    expect(evidenceIndex).not.toContain("sk-secretvalue");
    expect(mergedClaims).not.toContain("sk-secretvalue");
    expect(mergedClaims).toContain("[REDACTED_SECRET]");
  });

  it("redacts trace prompt content and raw output by default", async () => {
    const dir = await tmpDir();
    const result = await writeHybridRunArtifacts({
      outputDirectory: dir,
      normalizedSessions: [MINIMAL_SESSION],
      profile: MINIMAL_PROFILE,
      evidenceIndex: [],
      ruleClaims: [],
      llmSessionClaims: [],
      llmCategoryClaims: [],
      mergedClaims: [],
      skillPlan: {},
      llmTraces: [TRACE_WITH_PRIVATE_CONTENT],
      manifest: MINIMAL_MANIFEST,
      force: false,
    });

    const traces = JSON.parse(await readFile(result.llmTracesPath, "utf8")) as Array<LLMTrace>;
    expect(traces).toHaveLength(1);
    expect(traces[0]!.request.messages[0]!.content).toMatch(/^\[content omitted: \d+ chars\]$/);
    expect(traces[0]!.request.messages[1]!.content).toMatch(/^\[content omitted: \d+ chars\]$/);
    expect(traces[0]!.response.rawText).toBeUndefined();
    expect(traces[0]!.response.structuredOutput).toEqual({ kind: "candidate-claims", claims: [] });
  });
});

describe("writeGeneratedArtifacts", () => {
  it("writes summary.md and SKILL.md", async () => {
    const dir = await tmpDir();
    const result = await writeGeneratedArtifacts({
      outputDirectory: dir,
      summary: "# Summary",
      skill: VALID_SKILL,
      force: false,
    });

    expect(result.summaryPath).toContain("summary.md");
    expect(result.skillPath).toContain("SKILL.md");

    const summary = await readFile(result.summaryPath, "utf8");
    expect(summary).toBe("# Summary");
  });

  it("refuses to write invalid skill markdown", async () => {
    const dir = await tmpDir();
    await expect(writeGeneratedArtifacts({
      outputDirectory: dir,
      summary: "# Summary",
      skill: "# Skill",
      force: false,
    })).rejects.toThrow(CliUsageError);
  });
});

describe("writeHybridGeneratedArtifacts", () => {
  it("writes summary.md, SKILL.md, merged-claims.json, and skill-plan.json", async () => {
    const dir = await tmpDir();
    const result = await writeHybridGeneratedArtifacts({
      outputDirectory: dir,
      summary: "# Summary",
      skill: VALID_SKILL,
      mergedClaims: [{ citation: { excerpt: "OPENAI_API_KEY=sk-secretvalue" } }],
      skillPlan: { schemaVersion: "skill-plan/v1" },
      force: false,
    });

    expect(result.summaryPath).toContain("summary.md");
    expect(result.skillPath).toContain("SKILL.md");
    expect(result.mergedClaimsPath).toContain("merged-claims.json");
    expect(result.skillPlanPath).toContain("skill-plan.json");

    const plan = JSON.parse(await readFile(result.skillPlanPath, "utf8"));
    expect(plan.schemaVersion).toBe("skill-plan/v1");

    const claims = await readFile(result.mergedClaimsPath, "utf8");
    expect(claims).not.toContain("sk-secretvalue");
  });
});

describe("writeHarnessGeneratedArtifacts", () => {
  it("redacts trace prompt content and raw output by default", async () => {
    const dir = await tmpDir();
    const result = await writeHarnessGeneratedArtifacts({
      outputDirectory: dir,
      summary: "# Summary",
      skill: VALID_SKILL,
      claimManifest: MINIMAL_CLAIM_MANIFEST,
      skepticReport: MINIMAL_SKEPTIC_REPORT,
      verifierReport: MINIMAL_VERIFIER_REPORT,
      traces: [TRACE_WITH_PRIVATE_CONTENT],
      force: false,
    });

    expect(result.tracesPath).not.toBeNull();
    const traces = JSON.parse(await readFile(result.tracesPath!, "utf8")) as Array<LLMTrace>;
    expect(traces[0]!.request.messages[1]!.content).toMatch(/^\[content omitted: \d+ chars\]$/);
    expect(traces[0]!.response.rawText).toBeUndefined();
  });
});
