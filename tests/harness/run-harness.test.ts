import { describe, it, expect, vi } from "vitest";
import { MockLlmProvider } from "../mock-provider.js";
import type { NormalizedSession } from "../../src/normalize/models.js";
import {
  makeEvidenceItems,
} from "./fixtures.js";
import * as evidenceIndex from "../../src/harness/evidence-index.js";
import { analyzeWithHarness } from "../../src/harness/run-harness.js";

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
    expect(result.skepticReport!.schemaVersion).toBe("skeptic-report/v1");
    expect(result.writerOutput!.skillMarkdown).toContain("Skill");
    expect(result.verifierReport!.schemaVersion).toBe("verifier-report/v1");
    expect(result.traces).toHaveLength(4);
    expect(result.revisedManifest!.claims).toHaveLength(1);
    expect(result.error).toBeUndefined();
    expect(result.failedStage).toBeUndefined();
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

    expect(result.revisedManifest!.claims).toHaveLength(1);
    expect(result.revisedManifest!.claims[0]!.id).toBe("c1");
    expect(result.revisedManifest!.dimensionsCovered).not.toContain("constraint");
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

    expect(result.revisedManifest!.claims[0]!.confidence).toBe(0.75);
  });

  it("returns partial result when skeptic fails", async () => {
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
      evidence: makeEvidenceItems(3),
      provider: provider.toResolved(),
    });

    expect(result.manifest.claims).toHaveLength(1);
    expect(result.skepticReport).toBeUndefined();
    expect(result.revisedManifest).toBeDefined();
    expect(result.revisedManifest!.claims).toHaveLength(1);
    expect(result.writerOutput).toBeDefined();
    expect(result.writerOutput!.skillMarkdown).toContain("Skill");
    expect(result.verifierReport).toBeDefined();
    expect(result.error).toBe("skeptic failed: see traces");
    expect(result.failedStage).toBe("skeptic");
    expect(result.traces.length).toBeGreaterThanOrEqual(3);
  });

  it("uses fallback markdown when writer fails", async () => {
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
        { kind: "network-error", message: "Writer crashed" },
        { kind: "network-error", message: "Writer crashed" },
        {
          kind: "success",
          object: {
            pass: true,
            checkedItems: [],
            issues: [],
          },
        },
      ],
    });

    const result = await analyzeWithHarness({
      sessions: [makeTestSession("s1")],
      evidence: makeEvidenceItems(3),
      provider: provider.toResolved(),
    });

    expect(result.manifest.claims).toHaveLength(1);
    expect(result.skepticReport).toBeDefined();
    expect(result.writerOutput).toBeDefined();
    expect(result.writerOutput!.skillMarkdown).toContain("personalized-workflow");
    expect(result.writerOutput!.skillMarkdown).toContain("analysis first");
    expect(result.writerOutput!.sections).toHaveLength(1);
    expect(result.error).toBeUndefined();
    expect(result.failedStage).toBeUndefined();
  });

  it("aggregates worst severity for duplicate claimId issues", async () => {
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
              { claimId: "c1", severity: "medium", problemType: "overconfident", detail: "Too high", suggestion: "Lower" },
              { claimId: "c1", severity: "high", problemType: "unsupported", detail: "No evidence", suggestion: "Remove" },
            ],
            overallScore: 0.5,
          },
        },
        {
          kind: "success",
          object: {
            skillMarkdown: "# Skill\n\n## Constraint\n- type-safety\n",
            sections: [{
              title: "Constraint",
              summary: "Type safety preferred",
              directives: [{ text: "type-safety", sourceClaimId: "c2" }],
              groundingClaimIds: ["c2"],
            }],
          },
        },
        {
          kind: "success",
          object: {
            pass: true,
            checkedItems: [
              { directive: "type-safety", claimId: "c2", status: "verified" },
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

    expect(result.revisedManifest!.claims).toHaveLength(1);
    expect(result.revisedManifest!.claims[0]!.id).toBe("c2");
    expect(result.revisedManifest!.dimensionsCovered).not.toContain("work-style");
  });

  it("medium wins over low for duplicate claimId", async () => {
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
              { claimId: "c1", severity: "low", problemType: "vague", detail: "Slightly vague", suggestion: "Clarify" },
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

    expect(result.revisedManifest!.claims).toHaveLength(1);
    expect(result.revisedManifest!.claims[0]!.confidence).toBe(0.75);
  });

  it("short-circuits when analyst returns zero claims", async () => {
    const provider = new MockLlmProvider({
      structuredScenarios: [
        { kind: "success", object: { claims: [], evidenceSummary: "no patterns found", dimensionsCovered: [] } },
        { kind: "success", object: { claims: [], evidenceSummary: "no patterns found", dimensionsCovered: [] } },
        { kind: "success", object: { claims: [], evidenceSummary: "no patterns found", dimensionsCovered: [] } },
        { kind: "success", object: { issues: [], overallScore: 1.0 } },
        { kind: "success", object: { skillMarkdown: "# Should not be used\n", sections: [] } },
        { kind: "success", object: { pass: true, checkedItems: [], issues: [] } },
      ],
    });

    const result = await analyzeWithHarness({
      sessions: [makeTestSession("s1")],
      evidence: makeEvidenceItems(5),
      provider: provider.toResolved(),
    });

    expect(result.manifest.claims).toHaveLength(0);
    expect(result.manifest.schemaVersion).toBe("claim-manifest/v1");
    expect(result.skepticReport).toBeUndefined();
    expect(result.writerOutput).toBeDefined();
    expect(result.writerOutput!.skillMarkdown).toBe("");
    expect(result.writerOutput!.sections).toHaveLength(0);
    expect(result.verifierReport).toBeUndefined();
    expect(result.revisedManifest).toBeDefined();
    expect(result.revisedManifest!.claims).toHaveLength(0);
    expect(provider.structuredRequests).toHaveLength(3);
    expect(result.error).toBeUndefined();
    expect(result.failedStage).toBeUndefined();
    expect(result.traces).toHaveLength(1);
  });

  it("skips verifier when verifier fails", async () => {
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
        { kind: "timeout", message: "Verifier timed out" },
        { kind: "timeout", message: "Verifier timed out" },
        { kind: "timeout", message: "Verifier timed out" },
      ],
    });

    const result = await analyzeWithHarness({
      sessions: [makeTestSession("s1")],
      evidence: makeEvidenceItems(3),
      provider: provider.toResolved(),
    });

    expect(result.manifest.claims).toHaveLength(1);
    expect(result.skepticReport).toBeDefined();
    expect(result.writerOutput).toBeDefined();
    expect(result.writerOutput!.skillMarkdown).toContain("Skill");
    expect(result.verifierReport).toBeUndefined();
    expect(result.error).toBe("verifier failed: see traces");
    expect(result.failedStage).toBe("verifier");
    expect(result.traces.length).toBeGreaterThanOrEqual(4);
  });

  it("pre-computes selectedEvidence once and passes to skeptic/writer", async () => {
    const selectSpy = vi.spyOn(evidenceIndex, "selectEvidenceForBudget");

    const allEvidence = makeEvidenceItems(10);
    const selectedEvidence = allEvidence.slice(0, 3);
    selectSpy.mockReturnValue(selectedEvidence);

    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            claims: [
              { id: "c1", dimension: "work-style", label: "analysis-first", confidence: 0.8, rationale: "r", evidenceRefs: ["ev_001"] },
            ],
            evidenceSummary: "test",
            dimensionsCovered: ["work-style"],
          },
        },
        { kind: "success", object: { issues: [], overallScore: 1.0 } },
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
            checkedItems: [{ directive: "Begin with analysis", claimId: "c1", status: "verified" }],
            issues: [],
          },
        },
      ],
    });

    await analyzeWithHarness({
      sessions: [makeTestSession("s1")],
      evidence: allEvidence,
      provider: provider.toResolved(),
    });

    expect(selectSpy).toHaveBeenCalledTimes(2);
    expect(selectSpy).toHaveBeenNthCalledWith(2, expect.any(Array), expect.any(Number), expect.objectContaining({ preferDirectUser: true }));

    selectSpy.mockRestore();
  });

  it("skeptic and writer receive pre-computed evidence, not full evidence", async () => {
    const allEvidence = makeEvidenceItems(10);

    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            claims: [
              { id: "c1", dimension: "work-style", label: "analysis-first", confidence: 0.8, rationale: "r", evidenceRefs: ["ev_001"] },
            ],
            evidenceSummary: "test",
            dimensionsCovered: ["work-style"],
          },
        },
        { kind: "success", object: { issues: [], overallScore: 1.0 } },
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
            checkedItems: [{ directive: "Begin with analysis", claimId: "c1", status: "verified" }],
            issues: [],
          },
        },
      ],
    });

    await analyzeWithHarness({
      sessions: [makeTestSession("s1")],
      evidence: allEvidence,
      provider: provider.toResolved(),
    });

    const requests = provider.structuredRequests;
    expect(requests.length).toBeGreaterThanOrEqual(2);

    const skepticContent = String(requests[1]!.messages.find((m) => { const msg = m as { role: string; content: string }; return msg.role === "user"; })?.content ?? "");

    expect(skepticContent).toContain("ev_001");
  });

  it("filters skeptic evidence from selectedEvidence, not full evidence", async () => {
    const allEvidence = makeEvidenceItems(20);

    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            claims: [
              { id: "c1", dimension: "work-style", label: "analysis-first", confidence: 0.8, rationale: "r", evidenceRefs: ["ev_001", "ev_015"] },
            ],
            evidenceSummary: "test",
            dimensionsCovered: ["work-style"],
          },
        },
        { kind: "success", object: { issues: [], overallScore: 1.0 } },
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
            checkedItems: [{ directive: "Begin with analysis", claimId: "c1", status: "verified" }],
            issues: [],
          },
        },
      ],
    });

    await analyzeWithHarness({
      sessions: [makeTestSession("s1")],
      evidence: allEvidence,
      provider: provider.toResolved(),
    });

    const requests = provider.structuredRequests;
    const skepticContent = String(requests[1]!.messages.find((m) => { const msg = m as { role: string; content: string }; return msg.role === "user"; })?.content ?? "");

    const evidenceSectionMatch = skepticContent.match(/# Referenced Evidence \((\d+) items\)/);
    expect(evidenceSectionMatch).not.toBeNull();
    const evidenceItemCount = Number(evidenceSectionMatch![1]);

    expect(evidenceItemCount).toBeLessThan(20);
    expect(evidenceItemCount).toBeGreaterThan(0);
  });
});
