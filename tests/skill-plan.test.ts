import { afterEach, describe, expect, it, vi } from "vitest";

import type { RankedMergedClaim } from "../src/analyze/claim-merge.js";
import { buildSkillPlan } from "../src/generate/skill-plan.js";
import {
  sampleAcceptedMergedClaims,
  sampleTentativeMergedClaims,
} from "./fixtures/sample-hybrid-artifacts.js";

describe("buildSkillPlan", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps merged claims into directives, summary-only sections, and fallbacks", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_710_000_000_000);
    vi.spyOn(Math, "random").mockReturnValue(0.123456789);

    const plan = buildSkillPlan(sampleAcceptedMergedClaims, sampleTentativeMergedClaims);

    expect(plan.planID).toBe("plan:ltk9ukg0-4fzzzx");
    expect(plan.sections.map((section) => section.id)).toEqual([
      "work-style",
      "communication-style",
      "validation-habit",
      "constraint",
      "token-efficiency",
      "model-selection",
      "delegation-pattern",
      "summary",
    ]);
    expect(plan.directives["work-style"]).toEqual([
      {
        id: "directive:work-style:analysis-first",
        directive: "Begin with code inspection and context gathering before making changes",
        evidenceSummary: "llm-session, rule source(s), 2 evidence item(s) across 2 session(s), confidence 0.88",
        claimIDs: ["merged:work-style:analysis-first"],
        placement: "directive",
      },
    ]);
    expect(plan.sections.find((section) => section.id === "communication-style")?.summary).toBe(
      "Treat concise as a secondary communication style signal, and let explicit user instructions take precedence.",
    );
    expect(plan.fallbackDirectives["communication-style"]).toEqual([
      {
        id: "fallback:communication-style:default",
        directive: "Prefer balanced, direct communication unless the user signals otherwise",
        evidenceSummary: "Insufficient evidence for a specific directive",
        claimIDs: [],
        placement: "directive",
      },
    ]);
    expect(plan.sections.find((section) => section.id === "summary")).toEqual({
      id: "summary",
      title: "Additional Grounding",
      summary: "communication style: concise",
      claimIDs: ["claim:llm:concise"],
    });
  });

  it("emits fallback directives for every core section when evidence is absent", () => {
    const plan = buildSkillPlan([], []);

    expect(Object.keys(plan.directives)).toHaveLength(0);
    expect(Object.keys(plan.fallbackDirectives).sort()).toEqual([
      "communication-style",
      "constraint",
      "delegation-pattern",
      "model-selection",
      "token-efficiency",
      "validation-habit",
      "work-style",
    ]);
    expect(plan.sections.map((section) => section.summary)).toEqual([
      "Use a conservative coding workflow: inspect enough context, make focused changes, and adapt when the user asks for a different pace.",
      "Keep communication balanced, direct, and useful without over-explaining routine steps.",
      "Choose the most relevant verification for the files changed before reporting completion.",
      "Preserve existing project conventions and avoid destructive actions unless the user explicitly requests them.",
      "Spend context deliberately: gather what is needed, reuse known facts, and avoid unnecessary transcript-sized detail.",
      "Use the default model unless the task clearly needs a different cost, speed, or quality tradeoff.",
      "Handle straightforward work directly and verify any delegated or parallel results before relying on them.",
    ]);
  });

  it("respects section minimums when deciding whether to keep fallbacks", () => {
    const plan = buildSkillPlan(sampleAcceptedMergedClaims, sampleTentativeMergedClaims, {
      minClaimsPerSection: 2,
    });

    expect(plan.fallbackDirectives["work-style"]).toBeDefined();
    expect(plan.fallbackDirectives["validation-habit"]).toBeDefined();
    expect(plan.fallbackDirectives["constraint"]).toBeDefined();
    expect(plan.fallbackDirectives["communication-style"]).toBeDefined();
  });

  it("synthesizes contradictory workflow directives before rendering", () => {
    const oneShotClaim: RankedMergedClaim = {
      ...sampleAcceptedMergedClaims[0]!,
      claimID: "merged:work-style:one-shot",
      label: "one-shot",
      normalizedLabel: "one-shot",
      confidence: 0.82,
      sourceClaimIDs: ["claim:llm:one-shot"],
    };

    const plan = buildSkillPlan(
      [sampleAcceptedMergedClaims[0]!, oneShotClaim],
      [],
    );

    expect(plan.directives["work-style"]?.map((directive) => directive.id)).toEqual([
      "directive:work-style:analysis-first",
    ]);
    expect(plan.sections.find((section) => section.id === "work-style")?.summary).toBe(
      "Default to this practice: begin with code inspection and context gathering before making changes.",
    );
  });
});
