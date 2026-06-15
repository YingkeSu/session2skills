import { describe, expect, it } from "vitest";

import type {
  CandidateClaim,
  SkillPlan,
} from "../../src/normalize/models.js";
import { deriveConfidence, deriveName, deriveTrigger, deriveWorkflow, deriveConstraints, deriveValidation, deriveAntiPatterns, deriveEvidenceClaimIDs, buildSkillIntent } from "../../src/generate/skill-intent.js";

function makeClaim(claimID: string, dimension: CandidateClaim["dimension"] = "work-style"): CandidateClaim {
  return {
    schemaVersion: "candidate-claim/v1",
    claimID,
    dimension,
    // `label` typing varies per dimension; cast through a minimal literal.
    label: "analysis-first" as never,
    confidence: 0.8,
    rationale: "sample rationale",
    citations: [],
    source: { type: "rule", ruleID: "rule-1" },
  };
}

function makeSkillPlan(overrides: Partial<SkillPlan> = {}): SkillPlan {
  return {
    schemaVersion: "skill-plan/v1",
    planID: "plan:test",
    promptSetVersion: "prompt-set/v1",
    title: "Test Skill",
    overview: "Overview text.",
    sections: [],
    directives: {},
    fallbackDirectives: {},
    ...overrides,
  };
}

describe("deriveConfidence", () => {
  it("returns high when ratio >= 0.7 and accepted count >= 3", () => {
    const accepted = [makeClaim("a"), makeClaim("b"), makeClaim("c"), makeClaim("d")];
    const tentative = [makeClaim("t")];
    expect(deriveConfidence(accepted, tentative)).toBe("high");
  });

  it("returns medium when ratio >= 0.4 or accepted count >= 2", () => {
    const accepted = [makeClaim("a"), makeClaim("b")];
    const tentative = [makeClaim("t")];
    expect(deriveConfidence(accepted, tentative)).toBe("medium");
  });

  it("returns low when few accepted claims", () => {
    const accepted = [makeClaim("a")];
    const tentative = [makeClaim("t"), makeClaim("u"), makeClaim("v")];
    expect(deriveConfidence(accepted, tentative)).toBe("low");
  });

  it("returns low when both accepted and tentative are empty (divide-by-zero guard)", () => {
    expect(deriveConfidence([], [])).toBe("low");
  });

  it("returns medium at the accepted>=2 boundary even with low ratio", () => {
    const accepted = [makeClaim("a"), makeClaim("b")];
    const tentative = [makeClaim("t"), makeClaim("u"), makeClaim("v"), makeClaim("w"), makeClaim("x")];
    expect(deriveConfidence(accepted, tentative)).toBe("medium");
  });
});

describe("deriveName", () => {
  it("slugifies the skill plan title", () => {
    expect(deriveName(makeSkillPlan({ title: "TypeScript CLI Maintenance!" }))).toBe("typescript-cli-maintenance");
  });

  it("replaces runs of non-alphanumeric characters with a single hyphen", () => {
    expect(deriveName(makeSkillPlan({ title: "Refactor:  core   & utils" }))).toBe("refactor-core-utils");
  });

  it("trims leading and trailing hyphens", () => {
    expect(deriveName(makeSkillPlan({ title: "  --Edge Case--  " }))).toBe("edge-case");
  });

  it("returns untitled-skill when title is empty or only symbols", () => {
    expect(deriveName(makeSkillPlan({ title: "" }))).toBe("untitled-skill");
    expect(deriveName(makeSkillPlan({ title: "!!! --- ???" }))).toBe("untitled-skill");
  });

  it("truncates to 64 characters and trims trailing hyphen", () => {
    const longTitle = "A".repeat(100);
    const result = deriveName(makeSkillPlan({ title: longTitle }));
    expect(result.length).toBeLessThanOrEqual(64);
    expect(result.endsWith("-")).toBe(false);
  });
});

describe("deriveTrigger", () => {
  it("uses the skill plan overview directly", () => {
    expect(deriveTrigger(makeSkillPlan({ overview: "Use when refactoring shared types." })))
      .toBe("Use when refactoring shared types.");
  });

  it("falls back to a default trigger when overview is empty", () => {
    expect(deriveTrigger(makeSkillPlan({ overview: "" })))
      .toBe("Use when performing work that matches this skill's domain.");
  });
});

describe("deriveWorkflow", () => {
  it("collects work-style directive strings when present", () => {
    const plan = makeSkillPlan({
      directives: {
        "work-style": [
          { id: "d1", directive: "Inspect before editing.", evidenceSummary: "", claimIDs: [], placement: "directive" },
          { id: "d2", directive: "Ship small changes.", evidenceSummary: "", claimIDs: [], placement: "directive" },
        ],
      },
    });
    expect(deriveWorkflow(plan)).toEqual(["Inspect before editing.", "Ship small changes."]);
  });

  it("falls back to summary section split into lines when no work-style directives", () => {
    const plan = makeSkillPlan({
      sections: [
        { id: "summary", title: "Summary", summary: "Step one.\nStep two.", claimIDs: [] },
      ],
    });
    expect(deriveWorkflow(plan)).toEqual(["Step one.", "Step two."]);
  });

  it("uses a default workflow when both work-style and summary are absent", () => {
    expect(deriveWorkflow(makeSkillPlan())).toEqual([
      "Make the smallest cohesive change that satisfies the request.",
    ]);
  });
});

describe("deriveConstraints", () => {
  it("collects constraint directive strings when present", () => {
    const plan = makeSkillPlan({
      directives: {
        constraint: [
          { id: "c1", directive: "Preserve ESM import extensions.", evidenceSummary: "", claimIDs: [], placement: "directive" },
          { id: "c2", directive: "Avoid new runtime dependencies.", evidenceSummary: "", claimIDs: [], placement: "directive" },
        ],
      },
    });
    expect(deriveConstraints(plan)).toEqual([
      "Preserve ESM import extensions.",
      "Avoid new runtime dependencies.",
    ]);
  });

  it("uses a default constraint when none present", () => {
    expect(deriveConstraints(makeSkillPlan())).toEqual([
      "Preserve existing patterns and conventions.",
    ]);
  });
});

describe("deriveValidation", () => {
  it("collects validation-habit directive strings when present", () => {
    const plan = makeSkillPlan({
      directives: {
        "validation-habit": [
          { id: "v1", directive: "Run typecheck after contract changes.", evidenceSummary: "", claimIDs: [], placement: "directive" },
        ],
      },
    });
    expect(deriveValidation(plan)).toEqual(["Run typecheck after contract changes."]);
  });

  it("uses a default validation when none present", () => {
    expect(deriveValidation(makeSkillPlan())).toEqual([
      "Run typecheck and focused tests for changed behavior.",
    ]);
  });
});

describe("deriveAntiPatterns", () => {
  it("flattens fallback directive strings across all keys", () => {
    const plan = makeSkillPlan({
      fallbackDirectives: {
        "work-style": [
          { id: "f1", directive: "Do not rewrite unrelated flows.", evidenceSummary: "", claimIDs: [], placement: "directive" },
        ],
        constraint: [
          { id: "f2", directive: "Avoid new dependencies.", evidenceSummary: "", claimIDs: [], placement: "directive" },
        ],
      },
    });
    expect(deriveAntiPatterns(plan)).toEqual([
      "Do not rewrite unrelated flows.",
      "Avoid new dependencies.",
    ]);
  });

  it("includes constraint directives containing avoid or do not (case-insensitive)", () => {
    const plan = makeSkillPlan({
      directives: {
        constraint: [
          { id: "c1", directive: "AVOID destructive operations.", evidenceSummary: "", claimIDs: [], placement: "directive" },
          { id: "c2", directive: "Preserve existing patterns.", evidenceSummary: "", claimIDs: [], placement: "directive" },
          { id: "c3", directive: "Do Not leave debug artifacts.", evidenceSummary: "", claimIDs: [], placement: "directive" },
        ],
      },
    });
    expect(deriveAntiPatterns(plan)).toEqual([
      "AVOID destructive operations.",
      "Do Not leave debug artifacts.",
    ]);
  });

  it("combines fallback directives and matching constraint directives", () => {
    const plan = makeSkillPlan({
      directives: {
        constraint: [
          { id: "c1", directive: "Avoid new runtime deps.", evidenceSummary: "", claimIDs: [], placement: "directive" },
        ],
      },
      fallbackDirectives: {
        "validation-habit": [
          { id: "f1", directive: "Do not skip typecheck.", evidenceSummary: "", claimIDs: [], placement: "directive" },
        ],
      },
    });
    expect(deriveAntiPatterns(plan)).toEqual([
      "Do not skip typecheck.",
      "Avoid new runtime deps.",
    ]);
  });

  it("returns empty array when no fallback or matching constraint directives exist", () => {
    expect(deriveAntiPatterns(makeSkillPlan())).toEqual([]);
  });
});

describe("deriveEvidenceClaimIDs", () => {
  it("collects claimIDs from accepted and tentative claims", () => {
    const accepted = [makeClaim("claim-a"), makeClaim("claim-b")];
    const tentative = [makeClaim("claim-c")];
    expect(deriveEvidenceClaimIDs(accepted, tentative)).toEqual(["claim-a", "claim-b", "claim-c"]);
  });

  it("dedupes claimIDs across both lists", () => {
    const accepted = [makeClaim("claim-x")];
    const tentative = [makeClaim("claim-x"), makeClaim("claim-y")];
    expect(deriveEvidenceClaimIDs(accepted, tentative)).toEqual(["claim-x", "claim-y"]);
  });

  it("sorts claimIDs alphabetically", () => {
    const accepted = [makeClaim("zeta"), makeClaim("alpha")];
    const tentative = [makeClaim("mid")];
    expect(deriveEvidenceClaimIDs(accepted, tentative)).toEqual(["alpha", "mid", "zeta"]);
  });

  it("returns empty array when both lists are empty", () => {
    expect(deriveEvidenceClaimIDs([], [])).toEqual([]);
  });
});

describe("buildSkillIntent", () => {
  it("assembles a full SkillIntent from a populated plan and claims", () => {
    const plan = makeSkillPlan({
      title: "TypeScript CLI Maintenance",
      overview: "Maintain an existing TypeScript CLI.",
      directives: {
        "work-style": [
          { id: "w1", directive: "Inspect before editing.", evidenceSummary: "", claimIDs: [], placement: "directive" },
        ],
        constraint: [
          { id: "c1", directive: "Preserve ESM extensions.", evidenceSummary: "", claimIDs: [], placement: "directive" },
        ],
        "validation-habit": [
          { id: "v1", directive: "Run typecheck.", evidenceSummary: "", claimIDs: [], placement: "directive" },
        ],
      },
    });
    const accepted = [makeClaim("a"), makeClaim("b"), makeClaim("c")];
    const tentative = [makeClaim("d")];

    const intent = buildSkillIntent(plan, accepted, tentative);

    expect(intent.schemaVersion).toBe("skill-intent/v1");
    expect(intent.name).toBe("typescript-cli-maintenance");
    expect(intent.trigger).toBe("Maintain an existing TypeScript CLI.");
    expect(intent.targetAgent).toBe("generic");
    expect(intent.problemClass).toBe("Maintain an existing TypeScript CLI.");
    expect(intent.workflow).toEqual(["Inspect before editing."]);
    expect(intent.constraints).toEqual(["Preserve ESM extensions."]);
    expect(intent.validation).toEqual(["Run typecheck."]);
    expect(intent.antiPatterns).toEqual([]);
    expect(intent.evidenceClaimIDs).toEqual(["a", "b", "c", "d"]);
    expect(intent.confidence).toBe("high");
  });

  it("applies fallbacks when the plan has no directives and overview is empty", () => {
    const plan = makeSkillPlan({ title: "", overview: "" });
    const intent = buildSkillIntent(plan, [], []);

    expect(intent.name).toBe("untitled-skill");
    expect(intent.trigger).toBe("Use when performing work that matches this skill's domain.");
    expect(intent.problemClass).toBe("General development guidance.");
    expect(intent.workflow).toEqual(["Make the smallest cohesive change that satisfies the request."]);
    expect(intent.constraints).toEqual(["Preserve existing patterns and conventions."]);
    expect(intent.validation).toEqual(["Run typecheck and focused tests for changed behavior."]);
    expect(intent.antiPatterns).toEqual([]);
    expect(intent.evidenceClaimIDs).toEqual([]);
    expect(intent.confidence).toBe("low");
  });

  it("sets targetAgent to generic regardless of plan contents", () => {
    const intent = buildSkillIntent(makeSkillPlan(), [makeClaim("a"), makeClaim("b")], []);
    expect(intent.targetAgent).toBe("generic");
  });

  it("uses overview as problemClass but trigger fallback when overview is empty", () => {
    const intent = buildSkillIntent(makeSkillPlan({ overview: "" }), [], []);
    expect(intent.trigger).toBe("Use when performing work that matches this skill's domain.");
    expect(intent.problemClass).toBe("General development guidance.");
  });
});
