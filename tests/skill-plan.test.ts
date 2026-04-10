import { afterEach, describe, expect, it, vi } from "vitest";

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
      "Summary-only observation(s): concise.",
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
      title: "Summary-only insights",
      summary: "communication-style: concise (0.48)",
      claimIDs: ["claim:llm:concise"],
    });
  });

  it("emits fallback directives for every core section when evidence is absent", () => {
    const plan = buildSkillPlan([], []);

    expect(Object.keys(plan.directives)).toHaveLength(0);
    expect(Object.keys(plan.fallbackDirectives).sort()).toEqual([
      "communication-style",
      "constraint",
      "validation-habit",
      "work-style",
    ]);
    expect(plan.sections.map((section) => section.summary)).toEqual([
      "No strong evidence detected for work-style.",
      "No strong evidence detected for communication-style.",
      "No strong evidence detected for validation-habit.",
      "No strong evidence detected for constraint.",
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
});
