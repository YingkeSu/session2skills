import { describe, it, expect } from "vitest";
import {
  parseSkillType,
  AVAILABLE_SKILL_TYPES,
  SKILL_TYPE_DIMENSIONS,
  SKILL_TYPE_FOCUS,
} from "../../src/generate/skill-types.js";

describe("parseSkillType", () => {
  it.each(AVAILABLE_SKILL_TYPES)("accepts valid skill type: %s", (skillType) => {
    expect(parseSkillType(skillType)).toBe(skillType);
  });

  it("rejects invalid skill type", () => {
    expect(() => parseSkillType("invalid")).toThrow("Invalid skill type: invalid");
  });

  it("rejects empty string", () => {
    expect(() => parseSkillType("")).toThrow("Invalid skill type:");
  });

  it("includes available skill types in error message", () => {
    expect(() => parseSkillType("unknown")).toThrow("workflow, testing, code-style, debugging, review");
  });
});

describe("SKILL_TYPE_DIMENSIONS", () => {
  it("workflow includes all 7 dimensions", () => {
    expect(SKILL_TYPE_DIMENSIONS.workflow).toHaveLength(7);
  });

  it("testing includes validation-habit and constraint", () => {
    expect(SKILL_TYPE_DIMENSIONS.testing).toEqual(["validation-habit", "constraint"]);
  });

  it("code-style includes work-style, communication-style, token-efficiency", () => {
    expect(SKILL_TYPE_DIMENSIONS["code-style"]).toEqual([
      "work-style",
      "communication-style",
      "token-efficiency",
    ]);
  });

  it("debugging includes validation-habit and work-style", () => {
    expect(SKILL_TYPE_DIMENSIONS.debugging).toEqual(["validation-habit", "work-style"]);
  });

  it("review includes constraint and communication-style", () => {
    expect(SKILL_TYPE_DIMENSIONS.review).toEqual(["constraint", "communication-style"]);
  });

  it("all skill types have non-empty dimension arrays", () => {
    for (const skillType of AVAILABLE_SKILL_TYPES) {
      expect(SKILL_TYPE_DIMENSIONS[skillType].length).toBeGreaterThan(0);
    }
  });

  it("all referenced dimensions are valid taxonomy dimensions", () => {
    const allDimensions = new Set(SKILL_TYPE_DIMENSIONS.workflow);
    for (const skillType of AVAILABLE_SKILL_TYPES) {
      for (const dim of SKILL_TYPE_DIMENSIONS[skillType]) {
        expect(allDimensions.has(dim)).toBe(true);
      }
    }
  });
});

describe("SKILL_TYPE_FOCUS", () => {
  it("all skill types have a focus description", () => {
    for (const skillType of AVAILABLE_SKILL_TYPES) {
      expect(SKILL_TYPE_FOCUS[skillType]).toBeTruthy();
      expect(typeof SKILL_TYPE_FOCUS[skillType]).toBe("string");
    }
  });

  it("workflow focus mentions general workflow", () => {
    expect(SKILL_TYPE_FOCUS.workflow).toContain("workflow");
  });

  it("testing focus mentions testing practices", () => {
    expect(SKILL_TYPE_FOCUS.testing).toContain("testing");
  });
});
