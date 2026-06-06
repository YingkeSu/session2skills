import { describe, it, expect } from "vitest";
import { MockLlmProvider } from "../mock-provider.js";
import { runVerifierStage } from "../../src/harness/verifier.js";
import { makeClaimManifest, makeManifestClaim } from "./fixtures.js";

const SAMPLE_SKILL = `# Workflow Skill

## Workflow
Begin with code inspection before making changes.

## Constraints
Make minimal, focused changes.
`;

describe("harness verifier stage", () => {
  it("passes when all directives reference valid claims", async () => {
    const manifest = makeClaimManifest({
      claims: [
        makeManifestClaim({
          id: "c1",
          dimension: "work-style",
          label: "analysis-first",
          rationale: "The user begins with code inspection before making changes.",
        }),
        makeManifestClaim({
          id: "c2",
          dimension: "constraint",
          label: "minimal-diff",
          rationale: "The user asks for minimal, focused changes.",
        }),
      ],
    });
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            pass: true,
            checkedItems: [
              { directive: "Begin with code inspection", claimId: "c1", status: "verified" },
              { directive: "Make minimal, focused changes", claimId: "c2", status: "verified" },
            ],
            issues: [],
          },
        },
      ],
    });

    const result = await runVerifierStage(SAMPLE_SKILL, manifest, provider.toResolved());

    expect(result.report.pass).toBe(true);
    expect(result.report.checkedItems).toHaveLength(2);
    expect(result.report.checkedItems.every((item) => item.status === "verified")).toBe(true);
    expect(result.report.metadata.verifiedCount).toBe(2);
    expect(result.report.metadata.fabricatedCount).toBe(0);
    expect(result.trace.schemaVersion).toBe("llm-trace/v1");
  });

  it("fails when directives reference non-existent claims", async () => {
    const manifest = makeClaimManifest({
      claims: [
        makeManifestClaim({
          id: "c1",
          rationale: "The user begins with analysis.",
        }),
      ],
    });
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            pass: false,
            checkedItems: [
              { directive: "Begin with analysis", claimId: "c1", status: "verified" },
              { directive: "Always run TDD", claimId: "nonexistent", status: "unreferenced" },
            ],
            issues: [
              { description: "Directive 'Always run TDD' references unknown claim", location: "Workflow", severity: "high" },
            ],
          },
        },
      ],
    });

    const result = await runVerifierStage(SAMPLE_SKILL, manifest, provider.toResolved());

    expect(result.report.pass).toBe(false);
    expect(result.report.checkedItems[1]!.status).toBe("unreferenced");
    expect(result.report.issues.length).toBeGreaterThanOrEqual(1);
  });

  it("flags fabricated claims not in manifest", async () => {
    const manifest = makeClaimManifest({
      claims: [makeManifestClaim({ id: "c1" })],
    });
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            pass: false,
            checkedItems: [
              { directive: "Begin with analysis", claimId: "c1", status: "verified" },
              { directive: "Use test-driven development", claimId: null, status: "fabricated" },
            ],
            issues: [
              { description: "Fabricated directive with no source claim", location: "Workflow", severity: "high" },
            ],
          },
        },
      ],
    });

    const result = await runVerifierStage(SAMPLE_SKILL, manifest, provider.toResolved());

    expect(result.report.pass).toBe(false);
    expect(result.report.metadata.fabricatedCount).toBe(1);
  });

  it("handles empty SKILL.md", async () => {
    const manifest = makeClaimManifest({ claims: [] });
    const provider = new MockLlmProvider({
      structuredScenarios: [
        { kind: "success", object: { pass: true, checkedItems: [], issues: [] } },
      ],
    });

    const result = await runVerifierStage("", manifest, provider.toResolved());

    expect(result.report.pass).toBe(true);
    expect(result.report.checkedItems).toHaveLength(0);
  });

  it("fails when verifier skips directives rendered in markdown", async () => {
    const manifest = makeClaimManifest({
      claims: [
        makeManifestClaim({
          id: "c1",
          rationale: "The user begins with code inspection before making changes.",
        }),
      ],
    });
    const provider = new MockLlmProvider({
      structuredScenarios: [
        { kind: "success", object: { pass: true, checkedItems: [], issues: [] } },
      ],
    });

    const result = await runVerifierStage(SAMPLE_SKILL, manifest, provider.toResolved());

    expect(result.report.pass).toBe(false);
    expect(result.report.metadata.directiveCount).toBeGreaterThan(0);
    expect(result.report.issues.some((issue) => issue.description.includes("did not check"))).toBe(true);
  });

  it("handles LLM error", async () => {
    const manifest = makeClaimManifest();
    const provider = new MockLlmProvider({
      structuredScenarios: [{ kind: "network-error", message: "Verifier crashed" }],
    });

    await expect(
      runVerifierStage(SAMPLE_SKILL, manifest, provider.toResolved()),
    ).rejects.toThrow("Verifier crashed");
  });
});
