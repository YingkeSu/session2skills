import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateSkill } from "../src/generate/evaluate-skill.js";

function createSkillDirectory(overrides: {
  skillContent?: string;
  verifierContent?: string | null;
} = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), "s2s-evaluate-test-"));
  mkdirSync(root, { recursive: true });

  const skillContent = overrides.skillContent ?? `---
name: test-skill
description: A test skill for evaluation.
---

# Test Skill

Some guidance here.
`;
  writeFileSync(path.join(root, "SKILL.md"), skillContent);

  if (overrides.verifierContent !== null) {
    const verifierContent = overrides.verifierContent ?? JSON.stringify({
      schemaVersion: "verifier-report/v1",
      pass: true,
      checkedItems: [],
      issues: [],
      metadata: {
        generatedAt: new Date().toISOString(),
        directiveCount: 0,
        verifiedCount: 0,
        fabricatedCount: 0,
      },
    });
    writeFileSync(path.join(root, "verifier-report.json"), verifierContent);
  }

  return root;
}

describe("evaluateSkill", () => {
  it("returns pass verdict and pass gates for a clean skill with verifier", async () => {
    const skillDir = createSkillDirectory();

    const result = await evaluateSkill({ skillDirectory: skillDir });

    expect(result.evaluation.schemaVersion).toBe("skill-evaluation/v1");
    expect(result.evaluation.gates.lint).toBe("pass");
    expect(result.evaluation.gates.redaction).toBe("pass");
    expect(result.evaluation.gates.grounding).toBe("pass");
    expect(result.evaluation.verdict).toBe("pass");
    expect(result.evaluation.issues).toEqual([]);
    expect(result.evaluation.scores.grounding).toBe(1.0);
  });

  it("marks lint fail when frontmatter is missing", async () => {
    const skillDir = createSkillDirectory({
      skillContent: "# No frontmatter here\n",
    });

    const result = await evaluateSkill({ skillDirectory: skillDir });

    expect(result.evaluation.gates.lint).toBe("fail");
    expect(result.evaluation.issues.some((i) => i.message.includes("frontmatter"))).toBe(true);
    expect(result.evaluation.verdict).toBe("reject");
  });

  it("marks redaction fail when secrets are present", async () => {
    const skillDir = createSkillDirectory({
      skillContent: `---
name: secret-skill
description: Leaks a key.
---

# Secret Skill

OPENAI_API_KEY=sk-secretvalue123
`,
    });

    const result = await evaluateSkill({ skillDirectory: skillDir });

    expect(result.evaluation.gates.redaction).toBe("fail");
    expect(result.evaluation.issues.some((i) => i.message.includes("secret"))).toBe(true);
    expect(result.evaluation.verdict).toBe("reject");
  });

  it("marks grounding fail when verifier report says pass is false", async () => {
    const skillDir = createSkillDirectory({
      verifierContent: JSON.stringify({
        schemaVersion: "verifier-report/v1",
        pass: false,
        checkedItems: [],
        issues: [
          {
            description: "Fabricated directive detected",
            location: "Workflow",
            severity: "high",
          },
        ],
        metadata: {
          generatedAt: new Date().toISOString(),
          directiveCount: 1,
          verifiedCount: 0,
          fabricatedCount: 1,
        },
      }),
    });

    const result = await evaluateSkill({ skillDirectory: skillDir });

    expect(result.evaluation.gates.grounding).toBe("fail");
    expect(result.evaluation.verdict).toBe("needs-patch");
  });

  it("returns needs-patch when no verifier report is present", async () => {
    const skillDir = createSkillDirectory({ verifierContent: null });

    const result = await evaluateSkill({ skillDirectory: skillDir });

    expect(result.evaluation.gates.grounding).toBe("fail");
    expect(result.evaluation.verdict).toBe("needs-patch");
    expect(result.evaluation.issues.some((i) => i.message.includes("No verifier report"))).toBe(true);
  });

  it("flags debug language", async () => {
    const skillDir = createSkillDirectory({
      skillContent: `---
name: debug-skill
description: Contains debug language.
---

# Debug Skill

Use 3 directive(s) for best results.
`,
    });

    const result = await evaluateSkill({ skillDirectory: skillDir });

    expect(result.evaluation.issues.some((i) => i.message.includes("debug"))).toBe(true);
  });

  it("enforces size budget and escalates verdict to needs-patch", async () => {
    const skillDir = createSkillDirectory({
      skillContent: `---
name: big-skill
description: A large skill.
---

# Big Skill\n${"x".repeat(200_000)}
`,
    });

    const result = await evaluateSkill({ skillDirectory: skillDir, sizeBudget: 50_000 });

    expect(result.evaluation.issues.some((i) => i.message.includes("exceeds size budget"))).toBe(true);
    expect(result.evaluation.issues.some((i) => i.message.includes("exceeds size budget") && i.severity === "high")).toBe(true);
    expect(result.evaluation.verdict).toBe("needs-patch");
  });

  it.each([
    { content: "API_KEY=value\n", expected: "secret-material" },
    { content: "TOKEN=abc123\n", expected: "secret-material" },
  ])("detects secret material: $expected", async ({ content }) => {
    const skillDir = createSkillDirectory({
      skillContent: `---
name: secret-skill
description: Leaks secrets.
---

# Secret Skill\n\n${content}`,
    });

    const result = await evaluateSkill({ skillDirectory: skillDir });
    expect(result.evaluation.issues.some((i) => i.message.includes("secret"))).toBe(true);
  });

  it("uses explicit skill file name and verifier report file name", async () => {
    const root = createSkillDirectory();
    writeFileSync(path.join(root, "custom-skill.md"), `---
name: custom
description: Custom skill file.
---

# Custom
`);
    writeFileSync(
      path.join(root, "custom-verifier.json"),
      JSON.stringify({
        schemaVersion: "verifier-report/v1",
        pass: true,
        checkedItems: [],
        issues: [],
        metadata: {
          generatedAt: new Date().toISOString(),
          directiveCount: 0,
          verifiedCount: 0,
          fabricatedCount: 0,
        },
      }),
    );

    const result = await evaluateSkill({
      skillDirectory: root,
      skillFileName: "custom-skill.md",
      verifierReportFileName: "custom-verifier.json",
    });

    expect(result.evaluation.gates.lint).toBe("pass");
    expect(result.evaluation.gates.grounding).toBe("pass");
  });
});
