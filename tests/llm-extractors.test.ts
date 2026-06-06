import { describe, expect, it, beforeEach } from "vitest";

import { resetSessionClaimCounter, extractSessionClaimsViaLLM } from "../src/analyze/llm-extractors.js";
import type { ExtractionBudget } from "../src/analyze/llm-extractors.js";
import type { EvidenceItem, NormalizedSession } from "../src/normalize/models.js";
import { MockLlmProvider } from "./mock-provider.js";

// ---------------------------------------------------------------------------
// Inline factories
// ---------------------------------------------------------------------------

function makeEvidenceItem(id: string): EvidenceItem {
  return {
    schemaVersion: "evidence-item/v1",
    evidenceID: id,
    citation: {
      sessionID: "ses_1",
      messageID: "msg_1",
      partID: "part_1",
      sourceType: "message",
      evidenceID: id,
    },
    summaryText: `Evidence ${id}`,
    dimensions: ["work-style"],
  };
}

function makeSession(): NormalizedSession {
  return {
    id: "ses_1",
    title: "Test session",
    directory: "/test",
    updatedAt: Date.now(),
    messages: [{
      id: "msg_1",
      role: "user",
      timestamp: Date.now(),
      text: "Implement feature X with type safety",
      parts: [],
      toolInvocations: [],
      evidence: { sessionID: "ses_1", sourceType: "message" },
    }],
    toolInvocations: [],
    steps: [],
  };
}

const BUDGET: ExtractionBudget = {
  tokenBudget: 50000,
  timeoutMs: 30000,
  temperature: 0,
  maxOutputTokens: 4000,
};

function setupMock(claims: Array<Record<string, unknown>>): MockLlmProvider {
  return new MockLlmProvider({
    structuredScenarios: [{
      kind: "success",
      object: { claims },
    }],
  });
}

// ---------------------------------------------------------------------------
// Validation: valid claims
// ---------------------------------------------------------------------------

describe("extractSessionClaimsViaLLM validation", () => {
  beforeEach(() => resetSessionClaimCounter());

  it("accepts a valid claim with all required fields", async () => {
    const provider = setupMock([{
      dimension: "work-style",
      label: "iterative",
      confidence: 0.8,
      rationale: "Test rationale",
      evidenceIDs: ["ev1"],
    }]);
    const evidence = [makeEvidenceItem("ev1")];

    const result = await extractSessionClaimsViaLLM(
      makeSession(), evidence, BUDGET, provider.toResolved(),
    );

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].dimension).toBe("work-style");
    expect(result.claims[0].label).toBe("iterative");
    expect(result.claims[0].confidence).toBe(0.8);
    expect(result.rejectedClaims).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Validation: rejected claims
  // ---------------------------------------------------------------------------

  it("rejects claim with missing dimension", async () => {
    const provider = setupMock([{
      label: "iterative",
      confidence: 0.8,
      rationale: "Test",
      evidenceIDs: ["ev1"],
    }]);
    const result = await extractSessionClaimsViaLLM(
      makeSession(), [makeEvidenceItem("ev1")], BUDGET, provider.toResolved(),
    );

    expect(result.claims).toHaveLength(0);
    expect(result.rejectedClaims).toHaveLength(1);
    expect(result.rejectedClaims[0].reason).toContain("dimension");
  });

  it("rejects claim with invalid dimension", async () => {
    const provider = setupMock([{
      dimension: "invalid-dimension",
      label: "test",
      confidence: 0.8,
      rationale: "Test",
      evidenceIDs: ["ev1"],
    }]);
    const result = await extractSessionClaimsViaLLM(
      makeSession(), [makeEvidenceItem("ev1")], BUDGET, provider.toResolved(),
    );

    expect(result.claims).toHaveLength(0);
    expect(result.rejectedClaims).toHaveLength(1);
    expect(result.rejectedClaims[0].reason).toContain("invalid dimension");
  });

  it("rejects claim with missing label", async () => {
    const provider = setupMock([{
      dimension: "work-style",
      confidence: 0.8,
      rationale: "Test",
      evidenceIDs: ["ev1"],
    }]);
    const result = await extractSessionClaimsViaLLM(
      makeSession(), [makeEvidenceItem("ev1")], BUDGET, provider.toResolved(),
    );

    expect(result.rejectedClaims).toHaveLength(1);
    expect(result.rejectedClaims[0].reason).toContain("label");
  });

  it("rejects claim with missing rationale", async () => {
    const provider = setupMock([{
      dimension: "work-style",
      label: "iterative",
      confidence: 0.8,
      evidenceIDs: ["ev1"],
    }]);
    const result = await extractSessionClaimsViaLLM(
      makeSession(), [makeEvidenceItem("ev1")], BUDGET, provider.toResolved(),
    );

    expect(result.rejectedClaims).toHaveLength(1);
    expect(result.rejectedClaims[0].reason).toContain("rationale");
  });

  it("rejects claim with invalid confidence (negative)", async () => {
    const provider = setupMock([{
      dimension: "work-style",
      label: "iterative",
      confidence: -0.5,
      rationale: "Test",
      evidenceIDs: ["ev1"],
    }]);
    const result = await extractSessionClaimsViaLLM(
      makeSession(), [makeEvidenceItem("ev1")], BUDGET, provider.toResolved(),
    );

    expect(result.rejectedClaims).toHaveLength(1);
    expect(result.rejectedClaims[0].reason).toContain("confidence");
  });

  it("rejects claim with invalid confidence (>1)", async () => {
    const provider = setupMock([{
      dimension: "work-style",
      label: "iterative",
      confidence: 1.5,
      rationale: "Test",
      evidenceIDs: ["ev1"],
    }]);
    const result = await extractSessionClaimsViaLLM(
      makeSession(), [makeEvidenceItem("ev1")], BUDGET, provider.toResolved(),
    );

    expect(result.rejectedClaims).toHaveLength(1);
    expect(result.rejectedClaims[0].reason).toContain("confidence");
  });

  it("rejects claim with empty evidenceIDs", async () => {
    const provider = setupMock([{
      dimension: "work-style",
      label: "iterative",
      confidence: 0.8,
      rationale: "Test",
      evidenceIDs: [],
    }]);
    const result = await extractSessionClaimsViaLLM(
      makeSession(), [makeEvidenceItem("ev1")], BUDGET, provider.toResolved(),
    );

    expect(result.rejectedClaims).toHaveLength(1);
    expect(result.rejectedClaims[0].reason).toContain("evidenceIDs");
  });

  it("rejects claim with invalid evidenceID reference", async () => {
    const provider = setupMock([{
      dimension: "work-style",
      label: "iterative",
      confidence: 0.8,
      rationale: "Test",
      evidenceIDs: ["ev_nonexistent"],
    }]);
    const result = await extractSessionClaimsViaLLM(
      makeSession(), [makeEvidenceItem("ev1")], BUDGET, provider.toResolved(),
    );

    expect(result.rejectedClaims).toHaveLength(1);
    expect(result.rejectedClaims[0].reason).toContain("invalid evidenceID");
  });

  it("accepts claim with valid counterEvidenceIDs", async () => {
    const provider = setupMock([{
      dimension: "work-style",
      label: "iterative",
      confidence: 0.8,
      rationale: "Test",
      evidenceIDs: ["ev1"],
      counterEvidenceIDs: ["ev2"],
    }]);
    const result = await extractSessionClaimsViaLLM(
      makeSession(), [makeEvidenceItem("ev1"), makeEvidenceItem("ev2")], BUDGET, provider.toResolved(),
    );

    expect(result.claims).toHaveLength(1);
    expect(result.rejectedClaims).toHaveLength(0);
  });

  it("rejects claim with invalid counterEvidenceID reference", async () => {
    const provider = setupMock([{
      dimension: "work-style",
      label: "iterative",
      confidence: 0.8,
      rationale: "Test",
      evidenceIDs: ["ev1"],
      counterEvidenceIDs: ["ev_nonexistent"],
    }]);
    const result = await extractSessionClaimsViaLLM(
      makeSession(), [makeEvidenceItem("ev1")], BUDGET, provider.toResolved(),
    );

    expect(result.rejectedClaims).toHaveLength(1);
    expect(result.rejectedClaims[0].reason).toContain("counterEvidenceID");
  });

  // ---------------------------------------------------------------------------
  // Mixed valid/rejected
  // ---------------------------------------------------------------------------

  it("accepts valid claims and rejects invalid ones in the same call", async () => {
    const provider = setupMock([
      {
        dimension: "work-style",
        label: "iterative",
        confidence: 0.8,
        rationale: "Valid claim",
        evidenceIDs: ["ev1"],
      },
      {
        dimension: "invalid",
        label: "test",
        confidence: 0.5,
        rationale: "Invalid dimension",
        evidenceIDs: ["ev1"],
      },
    ]);
    const result = await extractSessionClaimsViaLLM(
      makeSession(), [makeEvidenceItem("ev1")], BUDGET, provider.toResolved(),
    );

    expect(result.claims).toHaveLength(1);
    expect(result.rejectedClaims).toHaveLength(1);
    expect(result.claims[0].label).toBe("iterative");
  });

  // ---------------------------------------------------------------------------
  // Error paths
  // ---------------------------------------------------------------------------

  it("returns empty claims on LLM timeout error", async () => {
    const provider = new MockLlmProvider({
      structuredScenarios: [{ kind: "timeout" }],
    });
    const result = await extractSessionClaimsViaLLM(
      makeSession(), [makeEvidenceItem("ev1")], BUDGET, provider.toResolved(),
    );

    expect(result.claims).toHaveLength(0);
    expect(result.error).toBeDefined();
    expect(result.trace.warnings).toBeDefined();
    expect(result.trace.warnings!.length).toBeGreaterThan(0);
  });

  it("returns empty claims on LLM network error", async () => {
    const provider = new MockLlmProvider({
      structuredScenarios: [{ kind: "network-error" }],
    });
    const result = await extractSessionClaimsViaLLM(
      makeSession(), [makeEvidenceItem("ev1")], BUDGET, provider.toResolved(),
    );

    expect(result.claims).toHaveLength(0);
    expect(result.error).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Trace artifact
  // ---------------------------------------------------------------------------

  it("produces a trace artifact with correct fields", async () => {
    const provider = setupMock([{
      dimension: "work-style",
      label: "iterative",
      confidence: 0.8,
      rationale: "Test",
      evidenceIDs: ["ev1"],
    }]);
    const result = await extractSessionClaimsViaLLM(
      makeSession(), [makeEvidenceItem("ev1")], BUDGET, provider.toResolved(),
    );

    expect(result.trace.schemaVersion).toBe("llm-trace/v1");
    expect(result.trace.traceID).toBeDefined();
    expect(result.trace.cache?.hit).toBeFalsy();
  });
});
