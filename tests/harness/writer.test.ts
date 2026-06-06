import { describe, it, expect } from "vitest";
import { MockLlmProvider } from "../mock-provider.js";
import { runWriterStage } from "../../src/harness/writer.js";
import { makeClaimManifest, makeMultiDimensionManifest } from "./fixtures.js";

describe("harness writer stage", () => {
  it("produces SKILL.md markdown from manifest", async () => {
    const manifest = makeClaimManifest();
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            skillMarkdown: "# Workflow Skill\n\n## Workflow\nBegin with analysis.\n",
            sections: [
              {
                title: "Workflow",
                summary: "The developer prefers analysis-first",
                directives: [
                  { text: "Begin with code inspection", sourceClaimId: "claim_001" },
                ],
                groundingClaimIds: ["claim_001"],
              },
            ],
          },
        },
      ],
    });

    const result = await runWriterStage(manifest, "balanced", provider.toResolved());

    expect(result.output.skillMarkdown).toContain("Workflow Skill");
    expect(result.output.sections).toHaveLength(1);
    expect(result.output.sections[0]!.directives).toHaveLength(1);
    expect(result.output.sections[0]!.directives[0]!.sourceClaimId).toBe("claim_001");
    expect(result.trace.schemaVersion).toBe("llm-trace/v1");
  });

  it("handles manifest with only 1 claim", async () => {
    const manifest = makeClaimManifest({
      claims: [
        { id: "c1", dimension: "constraint", label: "minimal-diff", confidence: 0.9, rationale: "test", evidenceRefs: ["ev_001"] },
      ],
      dimensionsCovered: ["constraint"],
    });
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            skillMarkdown: "# Skill\n\n## Constraints\n- minimal-diff\n",
            sections: [
              {
                title: "Constraints",
                summary: "Prefers minimal changes",
                directives: [{ text: "Make minimal changes", sourceClaimId: "c1" }],
                groundingClaimIds: ["c1"],
              },
            ],
          },
        },
      ],
    });

    const result = await runWriterStage(manifest, "concise", provider.toResolved());

    expect(result.output.sections).toHaveLength(1);
    expect(result.output.sections[0]!.title).toBe("Constraints");
  });

  it("handles manifest with claims across all 7 dimensions", async () => {
    const manifest = makeMultiDimensionManifest();
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            skillMarkdown: "# Full Skill\n7 dimensions covered.",
            sections: manifest.claims.map((c) => ({
              title: c.dimension,
              summary: `${c.label} detected`,
              directives: [{ text: `Favor ${c.label}`, sourceClaimId: c.id }],
              groundingClaimIds: [c.id],
            })),
          },
        },
      ],
    });

    const result = await runWriterStage(manifest, "detailed", provider.toResolved());

    expect(result.output.sections).toHaveLength(7);
  });

  it("handles LLM timeout", async () => {
    const manifest = makeClaimManifest();
    const provider = new MockLlmProvider({
      structuredScenarios: [{ kind: "timeout", message: "Writer timed out" }],
    });

    await expect(
      runWriterStage(manifest, "balanced", provider.toResolved()),
    ).rejects.toThrow("Writer timed out");
  });

  it("generates fallback markdown when LLM returns empty", async () => {
    const manifest = makeClaimManifest();
    const provider = new MockLlmProvider({
      structuredScenarios: [
        { kind: "success", object: {} },
      ],
    });

    const result = await runWriterStage(manifest, "balanced", provider.toResolved());

    expect(result.output.skillMarkdown).toContain("Personalized Workflow Skill");
    expect(result.output.skillMarkdown).toContain("name: personalized-workflow");
    expect(result.output.skillMarkdown).toContain("description:");
    expect(result.output.skillMarkdown).toContain("## Work Style");
    expect(result.output.skillMarkdown).not.toContain("confidence:");
    expect(result.output.sections).toHaveLength(1);
    expect(result.output.sections[0]!.directives).toHaveLength(1);
    expect(result.output.sections[0]!.directives[0]!.sourceClaimId).toBe("claim_001");
  });

  it("replaces invalid structured directives with claim-grounded sections", async () => {
    const manifest = makeClaimManifest();
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            skillMarkdown: "# Skill\n\n## Workflow\nAlways rewrite the architecture.\n",
            sections: [
              {
                title: "Workflow",
                summary: "Invalid grounding",
                directives: [{ text: "Always rewrite the architecture", sourceClaimId: "missing_claim" }],
                groundingClaimIds: ["missing_claim"],
              },
            ],
          },
        },
      ],
    });

    const result = await runWriterStage(manifest, "balanced", provider.toResolved());

    expect(result.output.sections).toHaveLength(1);
    expect(result.output.sections[0]!.groundingClaimIds).toEqual(["claim_001"]);
    expect(result.output.sections[0]!.directives[0]!.sourceClaimId).toBe("claim_001");
    expect(result.output.skillMarkdown).toContain("## Verified Operating Instructions");
  });
});
