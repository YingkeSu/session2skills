import { describe, it, expect } from "vitest";
import { MockLlmProvider } from "../mock-provider.js";
import { runSkepticStage } from "../../src/harness/skeptic.js";
import { LlmProviderError } from "../../src/shared/errors.js";
import { makeClaimManifest, makeManifestClaim, makeEvidenceItems, makeMultiDimensionManifest } from "./fixtures.js";

describe("harness skeptic stage", () => {
  it("produces valid SkepticReport from manifest", async () => {
    const manifest = makeClaimManifest();
    const evidence = makeEvidenceItems(3);
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            issues: [],
            overallScore: 0.95,
          },
        },
      ],
    });

    const result = await runSkepticStage(manifest, evidence, provider.toResolved());

    expect(result.report.schemaVersion).toBe("skeptic-report/v1");
    expect(result.report.issues).toHaveLength(0);
    expect(result.report.overallScore).toBe(0.95);
    expect(result.report.metadata.claimCount).toBe(1);
    expect(result.trace.schemaVersion).toBe("llm-trace/v1");
  });

  it("flags overconfident claims", async () => {
    const manifest = makeClaimManifest({
      claims: [
        makeManifestClaim({ id: "c1", confidence: 0.95, evidenceRefs: ["ev_001"] }),
      ],
    });
    const evidence = makeEvidenceItems(1);
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            issues: [
              {
                claimId: "c1",
                severity: "medium",
                problemType: "overconfident",
                detail: "Only 1 evidence item for 0.95 confidence",
                suggestion: "Reduce to 0.7",
              },
            ],
            overallScore: 0.7,
          },
        },
      ],
    });

    const result = await runSkepticStage(manifest, evidence, provider.toResolved());

    expect(result.report.issues).toHaveLength(1);
    expect(result.report.issues[0]!.severity).toBe("medium");
    expect(result.report.issues[0]!.problemType).toBe("overconfident");
  });

  it("assigns severity levels correctly", async () => {
    const manifest = makeClaimManifest({
      claims: [
        makeManifestClaim({ id: "c1" }),
        makeManifestClaim({ id: "c2" }),
        makeManifestClaim({ id: "c3" }),
      ],
    });
    const evidence = makeEvidenceItems(5);
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            issues: [
              { claimId: "c1", severity: "high", problemType: "unsupported", detail: "No evidence", suggestion: "Remove" },
              { claimId: "c2", severity: "medium", problemType: "vague", detail: "Vague rationale", suggestion: "Clarify" },
              { claimId: "c3", severity: "low", problemType: "duplicate", detail: "Duplicate of c1", suggestion: "Merge" },
            ],
            overallScore: 0.4,
          },
        },
      ],
    });

    const result = await runSkepticStage(manifest, evidence, provider.toResolved());

    expect(result.report.issues).toHaveLength(3);
    expect(result.report.issues.map((i) => i.severity)).toEqual(["high", "medium", "low"]);
  });

  it("handles empty manifest (0 claims)", async () => {
    const manifest = makeClaimManifest({ claims: [] });
    const provider = new MockLlmProvider({
      structuredScenarios: [
        { kind: "success", object: { issues: [], overallScore: 1.0 } },
      ],
    });

    const result = await runSkepticStage(manifest, [], provider.toResolved());

    expect(result.report.issues).toHaveLength(0);
    expect(result.report.metadata.claimCount).toBe(0);
  });

  it("handles LLM error gracefully after retries exhausted", async () => {
    const manifest = makeClaimManifest();
    const evidence = makeEvidenceItems(3);
    const provider = new MockLlmProvider({
      structuredScenarios: [
        { kind: "network-error", message: "Connection failed" },
        { kind: "network-error", message: "Connection failed" },
        { kind: "network-error", message: "Connection failed" },
      ],
    });

    await expect(
      runSkepticStage(manifest, evidence, provider.toResolved()),
    ).rejects.toThrow("Skeptic stage failed after 3 attempts");
  });

  it("defaults overallScore when LLM omits it", async () => {
    const manifest = makeClaimManifest({
      claims: [makeManifestClaim({ id: "c1" }), makeManifestClaim({ id: "c2" })],
    });
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            issues: [
              { claimId: "c1", severity: "high", problemType: "unsupported", detail: "d", suggestion: "s" },
            ],
          },
        },
      ],
    });

    const result = await runSkepticStage(manifest, makeEvidenceItems(3), provider.toResolved());

    expect(result.report.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.report.overallScore).toBeLessThanOrEqual(1);
  });

  it("retries on provider error and succeeds on second attempt", async () => {
    const manifest = makeMultiDimensionManifest();
    const evidence = makeEvidenceItems(7);
    const provider = new MockLlmProvider({
      structuredScenarios: [
        { kind: "timeout", message: "First attempt fails" },
        {
          kind: "success",
          object: {
            issues: [
              { claimId: "claim_001", severity: "medium", problemType: "overconfident", detail: "d", suggestion: "s" },
            ],
          },
        },
      ],
    });

    const result = await runSkepticStage(manifest, evidence, provider.toResolved());

    expect(result.report.issues).toHaveLength(1);
    expect(provider.structuredRequests).toHaveLength(2);
  });

  it("retries on empty issues for non-trivial manifest", async () => {
    const manifest = makeMultiDimensionManifest();
    const evidence = makeEvidenceItems(7);
    const provider = new MockLlmProvider({
      structuredScenarios: [
        { kind: "success", object: { issues: [] } },
        {
          kind: "success",
          object: {
            issues: [
              { claimId: "claim_001", severity: "low", problemType: "vague", detail: "d", suggestion: "s" },
            ],
          },
        },
      ],
    });

    const result = await runSkepticStage(manifest, evidence, provider.toResolved());

    expect(result.report.issues).toHaveLength(1);
  });

  it("does not retry on empty issues for trivial manifest", async () => {
    const manifest = makeClaimManifest();
    const evidence = makeEvidenceItems(3);
    const provider = new MockLlmProvider({
      structuredScenarios: [
        { kind: "success", object: { issues: [] } },
      ],
    });

    const result = await runSkepticStage(manifest, evidence, provider.toResolved());

    expect(result.report.issues).toHaveLength(0);
    expect(provider.structuredRequests).toHaveLength(1);
  });

  it("throws LlmProviderError after all retries fail", async () => {
    const manifest = makeMultiDimensionManifest();
    const evidence = makeEvidenceItems(7);
    const provider = new MockLlmProvider({
      structuredScenarios: [
        { kind: "timeout", message: "Attempt 1" },
        { kind: "timeout", message: "Attempt 2" },
        { kind: "timeout", message: "Attempt 3" },
      ],
    });

    await expect(
      runSkepticStage(manifest, evidence, provider.toResolved()),
    ).rejects.toThrow("Skeptic stage failed after 3 attempts");

    await expect(
      runSkepticStage(manifest, evidence, new MockLlmProvider({
        structuredScenarios: [
          { kind: "timeout", message: "A1" },
          { kind: "timeout", message: "A2" },
          { kind: "timeout", message: "A3" },
        ],
      }).toResolved()),
    ).rejects.toBeInstanceOf(LlmProviderError);
  });

  it("rejects malformed issues with empty detail and suggestion (model did not explain the critique)", async () => {
    const manifest = makeClaimManifest({
      claims: [
        makeManifestClaim({ id: "c1" }),
        makeManifestClaim({ id: "c2" }),
        makeManifestClaim({ id: "c3" }),
      ],
    });
    const evidence = makeEvidenceItems(5);
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            issues: [
              { claimId: "c1", severity: "high", problemType: "vague", detail: "", suggestion: "" },
              { claimId: "c2", severity: "high", problemType: "vague", detail: "   ", suggestion: "" },
              { claimId: "c3", severity: "high", problemType: "unsupported", detail: "", suggestion: "" },
            ],
            overallScore: 0.25,
          },
        },
        {
          kind: "success",
          object: { issues: [], overallScore: 0.9 },
        },
      ],
    });

    const result = await runSkepticStage(manifest, evidence, provider.toResolved());

    expect(result.report.issues).toHaveLength(0);
  });
});
