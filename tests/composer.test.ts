import { describe, expect, it } from "vitest";

import { composeSkillViaLLM, fallbackSkillRenderer } from "../src/generate/composer.js";
import { buildSkillPlan } from "../src/generate/skill-plan.js";
import { renderSkillArtifact } from "../src/generate/render-skill.js";
import type { PreferenceProfile } from "../src/normalize/models.js";
import {
  sampleAcceptedMergedClaims,
  sampleTentativeMergedClaims,
} from "./fixtures/sample-hybrid-artifacts.js";
import { MockLlmProvider } from "./mock-provider.js";

describe("composeSkillViaLLM", () => {
  it("renders deterministic markdown from the mock provider", async () => {
    const skillPlan = buildSkillPlan(sampleAcceptedMergedClaims, sampleTentativeMergedClaims);
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            title: "Personalized Workflow Skill",
            purpose: "Mirror the observed workflow using grounded directives only.",
            sections: skillPlan.sections.map((section) => ({
              id: section.id,
              summary: `Apply the ${section.title.toLowerCase()} guidance without inventing extra rules.`,
              groundingClaimIDs: section.claimIDs.length > 0 ? [section.claimIDs[0]] : [],
              directiveIDs: resolveDirectiveIDs(skillPlan, section.id),
            })),
          },
        },
      ],
    });

    const result = await composeSkillViaLLM(skillPlan, "balanced", undefined, provider.toResolved());

    expect(result.markdown).toContain("Apply the workflow guidance without inventing extra rules.");
    expect(result.markdown).toContain("Begin with code inspection and context gathering before making changes");
    expect(result.trace.provider).toBe("mock-ci");
    expect(provider.structuredRequests).toHaveLength(1);
  });

  it("rejects unsupported grounding claim ids from the composer output", async () => {
    const skillPlan = buildSkillPlan(sampleAcceptedMergedClaims, sampleTentativeMergedClaims);
    const provider = new MockLlmProvider({
      structuredScenarios: [
        {
          kind: "success",
          object: {
            purpose: "Bad grounding.",
            sections: skillPlan.sections.map((section) => ({
              id: section.id,
              summary: `Summary for ${section.id}`,
              groundingClaimIDs: section.claimIDs.length > 0 ? ["claim:not-allowed"] : [],
              directiveIDs: resolveDirectiveIDs(skillPlan, section.id),
            })),
          },
        },
      ],
    });

    await expect(
      composeSkillViaLLM(skillPlan, "balanced", undefined, provider.toResolved()),
    ).rejects.toThrow("unsupported claim ids");
  });
});

describe("renderSkillArtifact fallback path", () => {
  it("falls back when the provider times out", async () => {
    const skillPlan = buildSkillPlan(sampleAcceptedMergedClaims, sampleTentativeMergedClaims);
    const provider = new MockLlmProvider({
      structuredScenarios: [{ kind: "timeout", message: "Mock timeout after 25ms" }],
    });

    const result = await renderSkillArtifact(makeEmptyProfile(), "balanced", {
      skillPlan,
      llmClient: provider.toResolved(),
    });

    expect(result.renderer).toBe("fallback");
    expect(result.reason).toContain("timeout");
    expect(result.markdown).toBe(fallbackSkillRenderer(skillPlan, "balanced"));
  });

  it("falls back when the provider returns malformed JSON", async () => {
    const skillPlan = buildSkillPlan(sampleAcceptedMergedClaims, sampleTentativeMergedClaims);
    const provider = new MockLlmProvider({
      structuredScenarios: [{ kind: "malformed-json", rawText: '{"sections": [' }],
    });

    const result = await renderSkillArtifact(makeEmptyProfile(), "balanced", {
      skillPlan,
      llmClient: provider.toResolved(),
    });

    expect(result.renderer).toBe("fallback");
    expect(result.reason).toContain("Unexpected end of JSON input");
  });

  it("falls back when the provider hits a network error", async () => {
    const skillPlan = buildSkillPlan(sampleAcceptedMergedClaims, sampleTentativeMergedClaims);
    const provider = new MockLlmProvider({
      structuredScenarios: [{ kind: "network-error", message: "Mock network failure" }],
    });

    const result = await renderSkillArtifact(makeEmptyProfile(), "balanced", {
      skillPlan,
      llmClient: provider.toResolved(),
    });

    expect(result.renderer).toBe("fallback");
    expect(result.reason).toContain("Mock network failure");
  });
});

function resolveDirectiveIDs(skillPlan: ReturnType<typeof buildSkillPlan>, sectionID: string): Array<string> {
  return skillPlan.directives[sectionID]?.length
    ? skillPlan.directives[sectionID]!.map((directive) => directive.id)
    : (skillPlan.fallbackDirectives[sectionID] ?? []).map((directive) => directive.id);
}

function makeEmptyProfile(): PreferenceProfile {
  return {
    workStyle: [],
    communicationStyle: [],
    validationHabits: [],
    constraints: [],
    tokenEfficiency: [],
    modelSelection: [],
    delegationPattern: [],
    confidenceNotes: [],
  };
}
