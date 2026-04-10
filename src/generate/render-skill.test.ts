import { describe, expect, it } from "vitest";

import type { ResolvedLlmProvider } from "../llm/provider.js";
import type {
  LlmProvider,
  LlmStructuredGenerationRequest,
  LlmStructuredGenerationResult,
  LlmTextGenerationRequest,
  LlmTextGenerationResult,
} from "../llm/index.js";
import { DEFAULT_PROMPT_SET_VERSION, type PreferenceProfile, type SkillPlan } from "../normalize/models.js";
import { composeSkillViaLLM, fallbackSkillRenderer } from "./composer.js";
import { renderSkillArtifact } from "./render-skill.js";

describe("skill composition", () => {
  it("renders a deterministic fallback from the skill plan", () => {
    const skillPlan = makeSkillPlan();

    expect(fallbackSkillRenderer(skillPlan, "balanced")).toBe(fallbackSkillRenderer(skillPlan, "balanced"));
  });

  it("renders LLM-composed markdown with only allowed directives", async () => {
    const skillPlan = makeSkillPlan();
    const client = makeClient({
      purpose: "Mirror the observed workflow with direct, grounded instructions.",
      sections: [
        {
          id: "work-style",
          summary: "Inspect first, then move in small verified increments.",
          groundingClaimIDs: ["claim:analysis", "claim:iterative"],
          directiveIDs: ["directive:work-style:analysis-first", "directive:work-style:iterative"],
        },
        {
          id: "communication-style",
          summary: "Keep collaboration terse and decisive.",
          groundingClaimIDs: ["claim:concise"],
          directiveIDs: [],
        },
      ],
    });

    const result = await composeSkillViaLLM(skillPlan, "balanced", undefined, client);

    expect(result.markdown).toContain("Inspect first, then move in small verified increments.");
    expect(result.markdown).toContain("Begin with code inspection and context gathering before making changes");
    expect(result.markdown).toContain("Work in small incremental steps and verify each step before proceeding");
    expect(result.trace.stage).toBe("skill-plan");
  });

  it("falls back when the composer returns unsupported directives", async () => {
    const skillPlan = makeSkillPlan();
    const profile: PreferenceProfile = {
      workStyle: [],
      communicationStyle: [],
      validationHabits: [],
      constraints: [],
      confidenceNotes: [],
    };
    const client = makeClient({
      purpose: "Invalid output.",
      sections: [
        {
          id: "work-style",
          summary: "Inspect first.",
          groundingClaimIDs: ["claim:analysis"],
          directiveIDs: ["directive:not-allowed"],
        },
        {
          id: "communication-style",
          summary: "Stay concise.",
          groundingClaimIDs: ["claim:concise"],
          directiveIDs: [],
        },
      ],
    });

    const result = await renderSkillArtifact(profile, "balanced", { skillPlan, llmClient: client });

    expect(result.renderer).toBe("fallback");
    expect(result.reason).toContain("directive");
    expect(result.markdown).toBe(fallbackSkillRenderer(skillPlan, "balanced"));
  });
});

function makeSkillPlan(): SkillPlan {
  return {
    schemaVersion: "skill-plan/v1",
    planID: "plan:test",
    promptSetVersion: DEFAULT_PROMPT_SET_VERSION,
    title: "Personalized Workflow Skill Plan",
    overview: "Apply the observed habits without inventing unsupported instructions.",
    sections: [
      {
        id: "work-style",
        title: "Workflow",
        summary: "Lead with inspection and iterate carefully.",
        claimIDs: ["claim:analysis", "claim:iterative"],
      },
      {
        id: "communication-style",
        title: "Communication",
        summary: "Prefer concise status updates.",
        claimIDs: ["claim:concise"],
      },
    ],
    directives: {
      "work-style": [
        {
          id: "directive:work-style:analysis-first",
          directive: "Begin with code inspection and context gathering before making changes",
          evidenceSummary: "supported by two claims",
          claimIDs: ["claim:analysis"],
          placement: "directive",
        },
        {
          id: "directive:work-style:iterative",
          directive: "Work in small incremental steps and verify each step before proceeding",
          evidenceSummary: "supported by one claim",
          claimIDs: ["claim:iterative"],
          placement: "directive",
        },
      ],
    },
    fallbackDirectives: {},
  };
}

function makeClient(output: Record<string, unknown>): ResolvedLlmProvider {
  const provider: LlmProvider = {
    provider: "stub",
    listModels: () => [],
    async generateText(_request: LlmTextGenerationRequest): Promise<LlmTextGenerationResult> {
      throw new Error("not implemented");
    },
    async generateStructured<T>(
      request: LlmStructuredGenerationRequest<T>,
    ): Promise<LlmStructuredGenerationResult<T>> {
      return {
        object: request.schema.parse(output),
        rawText: JSON.stringify(output),
        finishReason: "stop",
        metadata: {
          provider: "stub",
          model: "stub-model",
          latencyMs: 1,
          attempts: 1,
        },
      };
    },
  };

  return {
    provider,
    model: { model: "stub-model" },
  };
}
