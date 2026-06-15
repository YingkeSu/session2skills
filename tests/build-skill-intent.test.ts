import { describe, expect, it } from "vitest";

import { buildSkillIntent } from "../src/generate/build-skill-intent.js";
import { buildSkillPlan } from "../src/generate/skill-plan.js";
import {
  sampleAcceptedMergedClaims,
  sampleTentativeMergedClaims,
} from "./fixtures/sample-hybrid-artifacts.js";

describe("buildSkillIntent", () => {
  it("produces a valid skill-intent/v1 from merged claims and a skill plan", () => {
    const skillPlan = buildSkillPlan(sampleAcceptedMergedClaims, sampleTentativeMergedClaims);
    const intent = buildSkillIntent(skillPlan, sampleAcceptedMergedClaims, sampleTentativeMergedClaims);

    expect(intent.schemaVersion).toBe("skill-intent/v1");
    expect(intent.name).toBe("personalized-repository-workflow-skill");
    expect(intent.targetAgent).toBe("generic");
    expect(intent.trigger.length).toBeGreaterThan(0);
    expect(intent.problemClass.length).toBeGreaterThan(0);
  });

  it("derives workflow from work-style directives", () => {
    const skillPlan = buildSkillPlan(sampleAcceptedMergedClaims, sampleTentativeMergedClaims);
    const intent = buildSkillIntent(skillPlan, sampleAcceptedMergedClaims, sampleTentativeMergedClaims);

    expect(intent.workflow.length).toBeGreaterThan(0);
    expect(intent.workflow[0]).toContain("Begin with code inspection");
  });

  it("derives constraints from constraint directives", () => {
    const skillPlan = buildSkillPlan(sampleAcceptedMergedClaims, sampleTentativeMergedClaims);
    const intent = buildSkillIntent(skillPlan, sampleAcceptedMergedClaims, sampleTentativeMergedClaims);

    expect(intent.constraints.length).toBeGreaterThan(0);
    expect(intent.constraints.some((c) => c.toLowerCase().includes("minimal"))).toBe(true);
  });

  it("derives validation from validation-habit directives", () => {
    const skillPlan = buildSkillPlan(sampleAcceptedMergedClaims, sampleTentativeMergedClaims);
    const intent = buildSkillIntent(skillPlan, sampleAcceptedMergedClaims, sampleTentativeMergedClaims);

    expect(intent.validation.length).toBeGreaterThan(0);
    expect(intent.validation.some((v) => v.toLowerCase().includes("diagnostics"))).toBe(true);
  });

  it("collects evidence claim IDs from all claims", () => {
    const skillPlan = buildSkillPlan(sampleAcceptedMergedClaims, sampleTentativeMergedClaims);
    const intent = buildSkillIntent(skillPlan, sampleAcceptedMergedClaims, sampleTentativeMergedClaims);

    expect(intent.evidenceClaimIDs).toContain("claim:llm:analysis-first");
    expect(intent.evidenceClaimIDs).toContain("claim:rule:analysis-first");
    expect(intent.evidenceClaimIDs).toContain("claim:rule:run-diagnostics");
    expect(intent.evidenceClaimIDs).toContain("claim:rule:minimal-diff");
    expect(intent.evidenceClaimIDs).toContain("claim:llm:concise");
  });

  it("derives high confidence when most claims are accepted", () => {
    const skillPlan = buildSkillPlan(sampleAcceptedMergedClaims, sampleTentativeMergedClaims);
    const intent = buildSkillIntent(skillPlan, sampleAcceptedMergedClaims, sampleTentativeMergedClaims);

    expect(intent.confidence).toBe("high");
  });

  it("derives medium confidence with moderate accepted ratio", () => {
    const twoAccepted = sampleAcceptedMergedClaims.slice(0, 2);
    const skillPlan = buildSkillPlan(twoAccepted, sampleTentativeMergedClaims);
    const intent = buildSkillIntent(skillPlan, twoAccepted, sampleTentativeMergedClaims);

    expect(intent.confidence).toBe("medium");
  });

  it("derives low confidence with no claims", () => {
    const skillPlan = buildSkillPlan([], []);
    const intent = buildSkillIntent(skillPlan, [], []);

    expect(intent.confidence).toBe("low");
    expect(intent.evidenceClaimIDs).toEqual([]);
  });

  it("produces anti-patterns from constraint directives", () => {
    const skillPlan = buildSkillPlan(sampleAcceptedMergedClaims, sampleTentativeMergedClaims);
    const intent = buildSkillIntent(skillPlan, sampleAcceptedMergedClaims, sampleTentativeMergedClaims);

    expect(intent.antiPatterns.length).toBeGreaterThan(0);
  });

  it("uses fallback workflow when no work-style directives exist", () => {
    const validationOnly = sampleAcceptedMergedClaims.filter((c) => c.dimension === "validation-habit");
    const skillPlan = buildSkillPlan(validationOnly, []);
    const intent = buildSkillIntent(skillPlan, validationOnly, []);

    expect(intent.workflow.length).toBeGreaterThan(0);
    expect(intent.confidence).toBe("medium");
  });

  it("accepts option overrides", () => {
    const skillPlan = buildSkillPlan(sampleAcceptedMergedClaims, sampleTentativeMergedClaims);
    const intent = buildSkillIntent(skillPlan, sampleAcceptedMergedClaims, sampleTentativeMergedClaims, {
      name: "custom-name",
      trigger: "custom trigger",
      targetAgent: "opencode",
      problemClass: "custom problem",
    });

    expect(intent.name).toBe("custom-name");
    expect(intent.trigger).toBe("custom trigger");
    expect(intent.targetAgent).toBe("opencode");
    expect(intent.problemClass).toBe("custom problem");
  });

  it("derives a deterministic name from skill plan title", () => {
    const skillPlan = buildSkillPlan(sampleAcceptedMergedClaims, sampleTentativeMergedClaims);
    const intentA = buildSkillIntent(skillPlan, sampleAcceptedMergedClaims, sampleTentativeMergedClaims);
    const intentB = buildSkillIntent(skillPlan, sampleAcceptedMergedClaims, sampleTentativeMergedClaims);

    expect(intentA.name).toBe(intentB.name);
  });

  it("produces deterministic output for identical inputs", () => {
    const skillPlan = buildSkillPlan(sampleAcceptedMergedClaims, sampleTentativeMergedClaims);

    const intentA = buildSkillIntent(skillPlan, sampleAcceptedMergedClaims, sampleTentativeMergedClaims);
    const intentB = buildSkillIntent(skillPlan, sampleAcceptedMergedClaims, sampleTentativeMergedClaims);

    expect(intentA).toEqual(intentB);
  });
});
