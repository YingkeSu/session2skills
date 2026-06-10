import { describe, it, expect } from "vitest";
import { MockLlmProvider } from "../mock-provider.js";
import { runAnalystStage } from "../../src/harness/analyst.js";
import { makeEvidenceItems } from "./fixtures.js";
import type { NormalizedSession } from "../../src/normalize/models.js";

describe("harness analyst stage", () => {
  const mockSessions: Array<NormalizedSession> = [
    {
      id: "ses_001",
      title: "Test session",
      directory: "/test",
      updatedAt: Date.now(),
      messages: [
        {
          id: "msg_001",
          role: "user",
          timestamp: Date.now(),
          text: "fix the bug",
          parts: [],
          toolInvocations: [],
          evidence: { sessionID: "ses_001", sourceType: "message" },
        },
      ],
      toolInvocations: [],
      steps: [],
    },
  ];

  it("produces valid ClaimManifest from sessions + evidence", async () => {
    const evidence = makeEvidenceItems(5);
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            claims: [
              {
                id: "claim_001",
                dimension: "work-style",
                label: "analysis-first",
                confidence: 0.8,
                rationale: "User explores before editing",
                evidenceRefs: ["ev_001", "ev_002"],
              },
            ],
            evidenceSummary: "5 evidence items from 1 session",
            dimensionsCovered: ["work-style"],
          },
        },
      ],
    });

    const result = await runAnalystStage(
      mockSessions,
      evidence,
      provider.toResolved(),
    );

    expect(result.manifest.schemaVersion).toBe("claim-manifest/v1");
    expect(result.manifest.claims).toHaveLength(1);
    expect(result.manifest.claims[0]!.id).toBe("claim_001");
    expect(result.manifest.claims[0]!.dimension).toBe("work-style");
    expect(result.manifest.claims[0]!.confidence).toBe(0.8);
    expect(result.manifest.dimensionsCovered).toEqual(["work-style"]);
    expect(result.manifest.metadata.sessionCount).toBe(1);
    expect(result.manifest.metadata.totalEvidenceItems).toBe(5);
    expect(result.trace.schemaVersion).toBe("llm-trace/v1");
    expect(result.trace.stage).toBe("harness-analyst");
  });

  it("covers all 7 dimensions when LLM returns them", async () => {
    const evidence = makeEvidenceItems(7);
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            claims: [
              { id: "c1", dimension: "work-style", label: "analysis-first", confidence: 0.8, rationale: "r", evidenceRefs: ["ev_001"] },
              { id: "c2", dimension: "communication-style", label: "concise", confidence: 0.7, rationale: "r", evidenceRefs: ["ev_002"] },
              { id: "c3", dimension: "validation-habit", label: "run-tests", confidence: 0.75, rationale: "r", evidenceRefs: ["ev_003"] },
              { id: "c4", dimension: "constraint", label: "minimal-diff", confidence: 0.9, rationale: "r", evidenceRefs: ["ev_004"] },
              { id: "c5", dimension: "token-efficiency", label: "explorer", confidence: 0.77, rationale: "r", evidenceRefs: ["ev_005"] },
              { id: "c6", dimension: "model-selection", label: "cost-conscious", confidence: 0.65, rationale: "r", evidenceRefs: ["ev_006"] },
              { id: "c7", dimension: "delegation-pattern", label: "parallelizer", confidence: 0.72, rationale: "r", evidenceRefs: ["ev_007"] },
            ],
            evidenceSummary: "7 items covering all dimensions",
            dimensionsCovered: [
              "work-style", "communication-style", "validation-habit", "constraint",
              "token-efficiency", "model-selection", "delegation-pattern",
            ],
          },
        },
      ],
    });

    const result = await runAnalystStage(mockSessions, evidence, provider.toResolved());

    expect(result.manifest.claims).toHaveLength(7);
    expect(result.manifest.dimensionsCovered).toHaveLength(7);
  });

  it("handles empty sessions gracefully", async () => {
    const provider = new MockLlmProvider({
      structuredScenarios: [
        { kind: "success", object: { claims: [], evidenceSummary: "No evidence", dimensionsCovered: [] } },
      ],
    });

    const result = await runAnalystStage([], [], provider.toResolved());

    expect(result.manifest.claims).toHaveLength(0);
    expect(result.manifest.metadata.sessionCount).toBe(0);
  });

  it("handles LLM timeout with graceful degradation", async () => {
    const provider = new MockLlmProvider({
      structuredScenarios: [{ kind: "timeout", message: "Mock timeout" }],
    });

    const result = await runAnalystStage(mockSessions, makeEvidenceItems(3), provider.toResolved());

    expect(result.manifest.claims).toHaveLength(0);
    expect(result.trace.inputArtifactRef).toContain("retries-exhausted");
  });

  it("handles malformed JSON from LLM with graceful degradation", async () => {
    const provider = new MockLlmProvider({
      structuredScenarios: [{ kind: "malformed-json", rawText: '{"broken": ' }],
    });

    const result = await runAnalystStage(mockSessions, makeEvidenceItems(3), provider.toResolved());

    expect(result.manifest.claims).toHaveLength(0);
    expect(result.trace.inputArtifactRef).toContain("retries-exhausted");
  });

  it("clamps confidence to 0-1 range", async () => {
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            claims: [
              { id: "c1", dimension: "work-style", label: "iterative", confidence: 1.5, rationale: "r", evidenceRefs: ["ev_001"] },
              { id: "c2", dimension: "work-style", label: "one-shot", confidence: -0.3, rationale: "r", evidenceRefs: ["ev_002"] },
            ],
            evidenceSummary: "test",
            dimensionsCovered: ["work-style"],
          },
        },
      ],
    });

    const result = await runAnalystStage(
      mockSessions,
      makeEvidenceItems(3),
      provider.toResolved(),
    );

    expect(result.manifest.claims[0]!.confidence).toBe(1);
    expect(result.manifest.claims[1]!.confidence).toBe(0);
  });

  it("filters claims with missing required fields", async () => {
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            claims: [
              { id: "c1", dimension: "work-style", label: "analysis-first", confidence: 0.8, rationale: "r", evidenceRefs: ["ev_001"] },
              { dimension: "work-style", label: "iterative", confidence: 0.5 },
              { id: "c3", dimension: "constraint" },
            ],
            evidenceSummary: "test",
            dimensionsCovered: ["work-style"],
          },
        },
      ],
    });

    const result = await runAnalystStage(
      mockSessions,
      makeEvidenceItems(3),
      provider.toResolved(),
    );

    expect(result.manifest.claims).toHaveLength(2);
    expect(result.manifest.claims[0]!.id).toBe("c1");
    expect(result.manifest.claims[1]!.id).toBe("claim_002");
    expect(result.manifest.claims[1]!.label).toBe("iterative");
  });
});
