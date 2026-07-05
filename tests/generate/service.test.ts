import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NormalizedSession } from "../../src/normalize/models.js";
import type { HarnessResult } from "../../src/harness/types.js";

vi.mock("../../src/sessions/load-sessions.js", () => ({
  loadSessions: vi.fn(),
  buildSessionLoadNotes: vi.fn(() => ["skipped: 0 sessions"]),
}));

vi.mock("../../src/persist/generated-artifacts.js", () => ({
  writeGeneratedArtifacts: vi.fn(async () => ({
    summaryPath: "/out/summary.md",
    skillPath: "/out/SKILL.md",
    claimManifestPath: "/out/claim-manifest.json",
    skepticReportPath: "/out/skeptic-report.json",
    verifierReportPath: "/out/verifier-report.json",
  })),
}));

vi.mock("../../src/evidence-store/index.js", () => ({
  // vitest 4 requires constructor mocks to use a `function`/`class` body rather
  // than an arrow factory, otherwise `new EvidenceStore(...)` throws
  // "... is not a constructor".
  EvidenceStore: vi.fn().mockImplementation(function () {
    return { close: vi.fn() };
  }),
}));

vi.mock("../../src/evidence-store/persist.js", () => ({
  persistRawEvidence: vi.fn(),
}));

vi.mock("../../src/evidence-store/paths.js", () => ({
  getDefaultEvidenceStorePath: vi.fn(() => "/tmp/test-evidence.db"),
}));

vi.mock("../../src/harness/run-harness.js", () => ({
  analyzeWithHarness: vi.fn(),
}));

const { loadSessions } = await import("../../src/sessions/load-sessions.js");
const { analyzeWithHarness } = await import("../../src/harness/run-harness.js");
const { generateSkillRun, resolveHybridLlmProvider, buildPromptRegistry } = await import(
  "../../src/generate/service.js"
);

function makeTestSession(id: string): NormalizedSession {
  return {
    id,
    title: `Test ${id}`,
    directory: "/test",
    updatedAt: Date.now(),
    messages: [
      {
        id: `${id}_msg_1`,
        role: "user",
        timestamp: Date.now(),
        text: "fix the bug in auth module",
        parts: [],
        toolInvocations: [],
        evidence: { sessionID: id, sourceType: "message" },
      },
    ],
    toolInvocations: [],
    steps: [],
  };
}

function makeHarnessResult(overrides?: Partial<HarnessResult>): HarnessResult {
  return {
    manifest: {
      schemaVersion: "claim-manifest/v1",
      claims: [
        { id: "c1", dimension: "work-style", label: "analyze-first", confidence: 0.8, rationale: "r", evidenceRefs: ["s1_msg_1"] },
      ],
      evidenceSummary: "1 session, 1 item",
      dimensionsCovered: ["work-style"],
      metadata: { generatedAt: new Date().toISOString(), sessionCount: 1, totalEvidenceItems: 1 },
    },
    revisedManifest: {
      schemaVersion: "claim-manifest/v1",
      claims: [
        { id: "c1", dimension: "work-style", label: "analyze-first", confidence: 0.8, rationale: "r", evidenceRefs: ["s1_msg_1"] },
      ],
      evidenceSummary: "1 session, 1 item",
      dimensionsCovered: ["work-style"],
      metadata: { generatedAt: new Date().toISOString(), sessionCount: 1, totalEvidenceItems: 1 },
    },
    skepticReport: {
      schemaVersion: "skeptic-report/v1",
      issues: [],
      overallScore: 0.95,
      metadata: { generatedAt: new Date().toISOString(), claimCount: 1, issueCount: 0 },
    },
    writerOutput: {
      skillMarkdown: "# Skill\n\n## Workflow\n\n- Analyze first\n",
      sections: [{
        title: "Workflow",
        summary: "Analysis-first approach",
        directives: [{ text: "Analyze first", sourceClaimId: "c1" }],
        groundingClaimIds: ["c1"],
      }],
    },
    verifierReport: {
      schemaVersion: "verifier-report/v1",
      pass: true,
      checkedItems: [{ directive: "Analyze first", claimId: "c1", status: "verified" }],
      issues: [],
      metadata: { generatedAt: new Date().toISOString(), directiveCount: 1, verifiedCount: 1, fabricatedCount: 0 },
    },
    traces: [],
    ...overrides,
  };
}

describe("generateSkillRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SESSION2SKILLS_LLM_BASE_URL;
    delete process.env.SESSION2SKILLS_LLM_MODEL;
    delete process.env.SESSION2SKILLS_LLM_PROVIDER;
    delete process.env.SESSION2SKILLS_LLM_API_KEY;
  });

  it("returns null for empty sessions", async () => {
    vi.mocked(loadSessions).mockResolvedValue({
      normalizedSessions: [],
      warnings: [],
      skippedSessions: 0,
    });

    const result = await generateSkillRun({
      projectDirectory: "/test",
      outputDirectory: "/out",
      recent: 5,
      force: false,
      tone: "balanced",
    });

    expect(result).toBeNull();
  });

  it("throws CliUsageError for missing LLM env vars", async () => {
    vi.mocked(loadSessions).mockResolvedValue({
      normalizedSessions: [makeTestSession("s1")],
      warnings: [],
      skippedSessions: 0,
    });

    await expect(
      generateSkillRun({
        projectDirectory: "/test",
        outputDirectory: "/out",
        recent: 5,
        force: false,
        tone: "balanced",
      }),
    ).rejects.toThrow("SESSION2SKILLS_LLM_BASE_URL");
  });

  it("runs full pipeline with injected provider", async () => {
    vi.mocked(loadSessions).mockResolvedValue({
      normalizedSessions: [makeTestSession("s1")],
      warnings: [],
      skippedSessions: 0,
    });

    vi.mocked(analyzeWithHarness).mockResolvedValue(makeHarnessResult());

    const { MockLlmProvider } = await import("../mock-provider.js");
    const provider = new MockLlmProvider();
    const registry = buildPromptRegistry();

    const result = await generateSkillRun({
      projectDirectory: "/test",
      outputDirectory: "/out",
      recent: 5,
      force: false,
      tone: "balanced",
      llmProvider: provider.toResolved(),
      promptRegistry: registry,
    });

    expect(result).not.toBeNull();
    expect(result!.mode).toBe("harness");
    expect(result!.verifierPassed).toBe(true);
    expect(result!.manifestClaims).toBe(1);
    expect(result!.skepticIssues).toBe(0);
    expect(result!.artifacts.skillPath).toBe("/out/SKILL.md");
    expect(result!.tone).toBe("balanced");
    expect(loadSessions).toHaveBeenCalledWith({
      directory: "/test",
      workspace: undefined,
      recent: 5,
    });
    expect(analyzeWithHarness).toHaveBeenCalledWith(
      expect.objectContaining({
        sessions: expect.any(Array),
        provider: expect.any(Object),
        tone: "balanced",
      }),
    );
  });

  it("resolves the provider from llmConfig when llmProvider is not injected", async () => {
    vi.mocked(loadSessions).mockResolvedValue({
      normalizedSessions: [makeTestSession("s1")],
      warnings: [],
      skippedSessions: 0,
    });
    vi.mocked(analyzeWithHarness).mockResolvedValue(makeHarnessResult());

    const result = await generateSkillRun({
      projectDirectory: "/test",
      outputDirectory: "/out",
      recent: 5,
      force: false,
      tone: "balanced",
      llmConfig: {
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-test",
        apiKey: "k",
      },
    });

    expect(result).not.toBeNull();
    // analyzeWithHarness receives the ResolvedLlmProvider as `provider`; its
    // own `.provider` is the OpenAiCompatibleProvider, whose `.provider` is the
    // id string. Assert the resolved id + model came from llmConfig, not env.
    expect(analyzeWithHarness).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: "balanced",
        provider: expect.objectContaining({
          provider: expect.objectContaining({ provider: "openai" }),
          model: expect.objectContaining({ model: "gpt-test" }),
        }),
      }),
    );
  });
});

describe("resolveHybridLlmProvider", () => {
  beforeEach(() => {
    delete process.env.SESSION2SKILLS_LLM_BASE_URL;
    delete process.env.SESSION2SKILLS_LLM_MODEL;
    delete process.env.SESSION2SKILLS_LLM_PROVIDER;
    delete process.env.SESSION2SKILLS_LLM_API_KEY;
  });

  it("throws when env vars are missing", () => {
    expect(() => resolveHybridLlmProvider()).toThrow("SESSION2SKILLS_LLM_BASE_URL");
  });

  it("returns provider when env vars are set", () => {
    process.env.SESSION2SKILLS_LLM_BASE_URL = "http://localhost:8080/v1";
    process.env.SESSION2SKILLS_LLM_MODEL = "test-model";

    const resolved = resolveHybridLlmProvider();
    expect(resolved.provider.provider).toBe("openai-compatible");
    expect(resolved.model.model).toBe("test-model");
  });
});

describe("buildPromptRegistry", () => {
  it("returns registry with all prompts registered", () => {
    const registry = buildPromptRegistry();
    expect(registry).toBeDefined();
    const analyst = registry.get("harness-analyst");
    expect(analyst.id).toBe("harness-analyst");
  });
});
