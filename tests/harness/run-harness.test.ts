import { describe, it, expect } from "vitest";
import { MockLlmProvider } from "../mock-provider.js";
import { analyzeWithHarness } from "../../src/harness/run-harness.js";
import type { NormalizedSession } from "../../src/normalize/models.js";
import {
  makeEvidenceItems,
  makeClaimManifest,
  makeManifestClaim,
} from "./fixtures.js";

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
        text: "fix the bug",
        parts: [],
        toolInvocations: [],
        evidence: { sessionID: id, sourceType: "message" },
      },
    ],
    toolInvocations: [],
    steps: [],
  };
}

describe("harness orchestrator", () => {
  it("produces full HarnessResult with all 4 artifacts", async () => {
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            claims: [
              { id: "c1", dimension: "work-style", label: "analysis-first", confidence: 0.8, rationale: "r", evidenceRefs: ["ev_001"] },
            ],
            evidenceSummary: "5 sessions, 7 items",
            dimensionsCovered: ["work-style"],
          },
        },
        {
          kind: "success",
          object: { issues: [], overallScore: 0.95 },
        },
        {
          kind: "success",
          object: {
            skillMarkdown: "# Skill\n\n## Workflow\n- Begin with analysis\n",
            sections: [{
              title: "Workflow",
              summary: "Analysis-first approach",
              directives: [{ text: "Begin with analysis", sourceClaimId: "c1" }],
              groundingClaimIds: ["c1"],
            }],
          },
        },
        {
          kind: "success",
          object: {
            pass: true,
            checkedItems: [
              { directive: "Begin with analysis", claimId: "c1", status: "verified" },
            ],
            issues: [],
          },
        },
      ],
    });

    const result = await analyzeWithHarness({
      sessions: [makeTestSession("s1")],
      evidence: makeEvidenceItems(5),
      provider: provider.toResolved(),
    });

    expect(result.manifest.schemaVersion).toBe("claim-manifest/v1");
    expect(result.skepticReport.schemaVersion).toBe("skeptic-report/v1");
    expect(result.writerOutput.skillMarkdown).toContain("Skill");
    expect(result.verifierReport.schemaVersion).toBe("verifier-report/v1");
    expect(result.traces).toHaveLength(4);
    expect(result.revisedManifest.claims).toHaveLength(1);
  });

  it("drops high-severity claims after skeptic feedback", async () => {
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            claims: [
              { id: "c1", dimension: "work-style", label: "analysis-first", confidence: 0.8, rationale: "r", evidenceRefs: ["ev_001"] },
              { id: "c2", dimension: "constraint", label: "type-safety", confidence: 0.9, rationale: "r", evidenceRefs: ["ev_002"] },
            ],
            evidenceSummary: "test",
            dimensionsCovered: ["work-style", "constraint"],
          },
        },
        {
          kind: "success",
          object: {
            issues: [
              { claimId: "c2", severity: "high", problemType: "unsupported", detail: "No real evidence", suggestion: "Remove" },
            ],
            overallScore: 0.5,
          },
        },
        {
          kind: "success",
          object: {
            skillMarkdown: "# Skill\n\n## Workflow\n- Begin with analysis\n",
            sections: [{
              title: "Workflow",
              summary: "Analysis-first",
              directives: [{ text: "Begin with analysis", sourceClaimId: "c1" }],
              groundingClaimIds: ["c1"],
            }],
          },
        },
        {
          kind: "success",
          object: {
            pass: true,
            checkedItems: [
              { directive: "Begin with analysis", claimId: "c1", status: "verified" },
            ],
            issues: [],
          },
        },
      ],
    });

    const result = await analyzeWithHarness({
      sessions: [makeTestSession("s1")],
      evidence: makeEvidenceItems(5),
      provider: provider.toResolved(),
    });

    expect(result.revisedManifest.claims).toHaveLength(1);
    expect(result.revisedManifest.claims[0]!.id).toBe("c1");
    expect(result.revisedManifest.dimensionsCovered).not.toContain("constraint");
  });

  it("reduces confidence for medium-severity issues", async () => {
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            claims: [
              { id: "c1", dimension: "work-style", label: "analysis-first", confidence: 0.9, rationale: "r", evidenceRefs: ["ev_001"] },
            ],
            evidenceSummary: "test",
            dimensionsCovered: ["work-style"],
          },
        },
        {
          kind: "success",
          object: {
            issues: [
              { claimId: "c1", severity: "medium", problemType: "overconfident", detail: "Too high", suggestion: "Lower" },
            ],
            overallScore: 0.7,
          },
        },
        {
          kind: "success",
          object: {
            skillMarkdown: "# Skill\n- Test\n",
            sections: [],
          },
        },
        {
          kind: "success",
          object: { pass: true, checkedItems: [], issues: [] },
        },
      ],
    });

    const result = await analyzeWithHarness({
      sessions: [makeTestSession("s1")],
      evidence: makeEvidenceItems(3),
      provider: provider.toResolved(),
    });

    expect(result.revisedManifest.claims[0]!.confidence).toBe(0.75);
  });

  it("propagates errors from any stage", async () => {
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            claims: [{ id: "c1", dimension: "work-style", label: "analysis-first", confidence: 0.8, rationale: "r", evidenceRefs: ["ev_001"] }],
            evidenceSummary: "test",
            dimensionsCovered: ["work-style"],
          },
        },
        { kind: "timeout", message: "Skeptic timed out" },
        { kind: "timeout", message: "Skeptic timed out" },
        { kind: "timeout", message: "Skeptic timed out" },
      ],
    });

    await expect(
      analyzeWithHarness({
        sessions: [makeTestSession("s1")],
        evidence: makeEvidenceItems(3),
        provider: provider.toResolved(),
      }),
    ).rejects.toThrow("Skeptic stage failed after 3 attempts");
  });

  it("collects traces from all completed stages before error", async () => {
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            claims: [{ id: "c1", dimension: "work-style", label: "analysis-first", confidence: 0.8, rationale: "r", evidenceRefs: ["ev_001"] }],
            evidenceSummary: "test",
            dimensionsCovered: ["work-style"],
          },
        },
        { kind: "success", object: { issues: [], overallScore: 1.0 } },
        { kind: "network-error", message: "Writer crashed" },
      ],
    });

    try {
      await analyzeWithHarness({
        sessions: [makeTestSession("s1")],
        evidence: makeEvidenceItems(3),
        provider: provider.toResolved(),
      });
    } catch {
      // Expected to throw
    }

    expect(provider.structuredRequests).toHaveLength(3);
  });
});
