import { describe, expect, it } from "vitest";

import { assertValidSkillMarkdown, lintSkillMarkdown } from "../src/generate/skill-lint.js";
import { CliUsageError } from "../src/shared/errors.js";

const VALID_SKILL = `---
name: workflow-style
description: Use when adapting to this user's observed coding workflow.
---

# Workflow Style

Follow the user's observed validation and communication preferences.
`;

describe("lintSkillMarkdown", () => {
  it("accepts SKILL.md with name and description frontmatter", () => {
    expect(lintSkillMarkdown(VALID_SKILL)).toEqual([]);
  });

  it("requires frontmatter name and description", () => {
    const issues = lintSkillMarkdown("# Missing Frontmatter");
    expect(issues.map((issue) => issue.code)).toContain("missing-frontmatter");
  });

  it("rejects debug phrases in production skill output", () => {
    const issues = lintSkillMarkdown(`${VALID_SKILL}\n3 directive(s): analysis-first`);
    expect(issues.map((issue) => issue.code)).toContain("debug-phrase");
  });

  it("rejects obvious secrets and environment payloads", () => {
    const issues = lintSkillMarkdown(`${VALID_SKILL}\n.env\nOPENAI_API_KEY=sk-secretvalue`);
    expect(issues.map((issue) => issue.code)).toContain("secret-material");
    expect(issues.map((issue) => issue.code)).toContain("env-payload");
  });
});

describe("assertValidSkillMarkdown", () => {
  it("throws a user-facing error for invalid skill markdown", () => {
    expect(() => assertValidSkillMarkdown("# Missing Frontmatter")).toThrow(CliUsageError);
  });
});
