import { describe, expect, it } from "vitest";

import {
  sampleEvolutionCandidate,
  sampleSkillEvaluation,
  sampleSkillIntent,
  sampleSkillPatch,
} from "./fixtures/sample-skill-lifecycle-artifacts.js";

describe("skill lifecycle contracts", () => {
  it("defines a skill intent as a process-oriented generation target", () => {
    expect(sampleSkillIntent.schemaVersion).toBe("skill-intent/v1");
    expect(sampleSkillIntent.workflow.length).toBeGreaterThan(0);
    expect(sampleSkillIntent.validation).toContain("Run typecheck after changing shared contracts.");
    expect(sampleSkillIntent.evidenceClaimIDs).toEqual(
      expect.arrayContaining(["merged-workstyle-analysis-first"]),
    );
  });

  it("defines targeted patches with claim grounding and risk", () => {
    expect(sampleSkillPatch.schemaVersion).toBe("skill-patch/v1");
    expect(sampleSkillPatch.find).not.toBe(sampleSkillPatch.replace);
    expect(sampleSkillPatch.claimIDs).toEqual(["merged-validation-run-diagnostics"]);
    expect(sampleSkillPatch.risk).toBe("low");
  });

  it("captures deterministic gates and scored evaluation dimensions", () => {
    expect(sampleSkillEvaluation.schemaVersion).toBe("skill-evaluation/v1");
    expect(Object.values(sampleSkillEvaluation.gates).every((status) => status === "pass")).toBe(true);

    for (const score of Object.values(sampleSkillEvaluation.scores)) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it("links an evolution candidate to its patch and evaluation", () => {
    expect(sampleEvolutionCandidate.schemaVersion).toBe("evolution-candidate/v1");
    expect(sampleEvolutionCandidate.patch).toBe(sampleSkillPatch);
    expect(sampleEvolutionCandidate.evaluation).toBe(sampleSkillEvaluation);
    expect(sampleEvolutionCandidate.baseSkillID).toBe(sampleSkillEvaluation.skillID);
  });
});
