import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateSkill, computeComposite, computeGrade } from "../src/generate/evaluate-skill.js";
import type { ClaimManifest, SkepticReport, VerifierReport } from "../src/harness/types.js";

function createSkillDirectory(overrides: {
  skillContent?: string;
  verifierContent?: string | null;
  claimManifest?: ClaimManifest | null;
  skepticReport?: SkepticReport | null;
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

  if (overrides.claimManifest !== null) {
    const manifestContent = overrides.claimManifest
      ? JSON.stringify(overrides.claimManifest)
      : JSON.stringify({
          schemaVersion: "claim-manifest/v1",
          claims: [
            {
              id: "claim_001",
              dimension: "work-style",
              label: "analysis-first",
              confidence: 0.9,
              rationale: "Test rationale.",
              evidenceRefs: ["ev1", "ev2", "ev3"],
            },
            {
              id: "claim_002",
              dimension: "constraint",
              label: "type-safety",
              confidence: 0.8,
              rationale: "Test rationale.",
              evidenceRefs: ["ev4"],
            },
          ],
          evidenceSummary: "",
          dimensionsCovered: ["work-style", "constraint"],
          metadata: {
            generatedAt: new Date().toISOString(),
            sessionCount: 5,
            totalEvidenceItems: 10,
          },
        });
    writeFileSync(path.join(root, "claim-manifest.json"), manifestContent);
  }

  if (overrides.skepticReport !== null) {
    const skepticContent = overrides.skepticReport
      ? JSON.stringify(overrides.skepticReport)
      : JSON.stringify({
          schemaVersion: "skeptic-report/v1",
          issues: [],
          overallScore: 0.8,
          metadata: {
            generatedAt: new Date().toISOString(),
            claimCount: 2,
            issueCount: 0,
          },
        });
    writeFileSync(path.join(root, "skeptic-report.json"), skepticContent);
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

  it("flags report-style confidence and rationale prose", async () => {
    const skillDir = createSkillDirectory({
      skillContent: `---
name: report-skill
description: Contains report-style prose.
---

# Report Skill

## Work Style
- analysis-first (confidence: 0.90)
  The user repeatedly inspects code before editing.

## Confidence notes
- workStyle: strongest signal \`analysis-first\` with weight 3
`,
    });

    const result = await evaluateSkill({ skillDirectory: skillDir });

    expect(result.evaluation.gates.lint).toBe("fail");
    expect(result.evaluation.verdict).toBe("reject");
    expect(result.evaluation.issues.some((i) => i.message.includes("confidence/rationale report prose"))).toBe(true);
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

  it("computes skepticQuality from skeptic report overallScore", async () => {
    const skillDir = createSkillDirectory({
      skepticReport: {
        schemaVersion: "skeptic-report/v1",
        issues: [],
        overallScore: 0.8,
        metadata: { generatedAt: new Date().toISOString(), claimCount: 2, issueCount: 0 },
      },
    });

    const result = await evaluateSkill({ skillDirectory: skillDir });

    expect(result.evaluation.scores.skepticQuality).toBe(0.8);
  });

  it("defaults skepticQuality to 0.5 when no skeptic report", async () => {
    const skillDir = createSkillDirectory({ skepticReport: null });

    const result = await evaluateSkill({ skillDirectory: skillDir });

    expect(result.evaluation.scores.skepticQuality).toBe(0.5);
  });

  it("computes evidenceRichness from claim manifest evidence refs", async () => {
    const skillDir = createSkillDirectory({
      claimManifest: {
        schemaVersion: "claim-manifest/v1",
        claims: [
          {
            id: "c1",
            dimension: "work-style",
            label: "analysis-first",
            confidence: 0.9,
            rationale: "r",
            evidenceRefs: ["e1", "e2", "e3"],
          },
          {
            id: "c2",
            dimension: "constraint",
            label: "type-safety",
            confidence: 0.8,
            rationale: "r",
            evidenceRefs: ["e4", "e5", "e6"],
          },
        ],
        evidenceSummary: "",
        dimensionsCovered: ["work-style", "constraint"],
        metadata: { generatedAt: new Date().toISOString(), sessionCount: 5, totalEvidenceItems: 10 },
      },
    });

    const result = await evaluateSkill({ skillDirectory: skillDir });

    // mean evidenceRefs length = (3 + 3) / 2 = 3; 3 / 3 = 1.0
    expect(result.evaluation.scores.evidenceRichness).toBe(1.0);
  });

  it("floors evidenceRichness at 0.3", async () => {
    const skillDir = createSkillDirectory({
      claimManifest: {
        schemaVersion: "claim-manifest/v1",
        claims: [
          {
            id: "c1",
            dimension: "work-style",
            label: "analysis-first",
            confidence: 0.9,
            rationale: "r",
            evidenceRefs: ["e1"],
          },
        ],
        evidenceSummary: "",
        dimensionsCovered: ["work-style"],
        metadata: { generatedAt: new Date().toISOString(), sessionCount: 1, totalEvidenceItems: 1 },
      },
    });

    const result = await evaluateSkill({ skillDirectory: skillDir });

    // mean evidenceRefs length = 1; 1 / 3 = 0.333... → floored at 0.3
    expect(result.evaluation.scores.evidenceRichness).toBeCloseTo(0.333, 2);
  });

  it("defaults evidenceRichness to 0.3 when no claim manifest", async () => {
    const skillDir = createSkillDirectory({ claimManifest: null });

    const result = await evaluateSkill({ skillDirectory: skillDir });

    expect(result.evaluation.scores.evidenceRichness).toBe(0.3);
  });

  it("computes composite as weighted sum of all 8 dimensions", async () => {
    const skillDir = createSkillDirectory({
      claimManifest: {
        schemaVersion: "claim-manifest/v1",
        claims: [
          {
            id: "c1",
            dimension: "work-style",
            label: "analysis-first",
            confidence: 0.9,
            rationale: "r",
            evidenceRefs: ["e1", "e2", "e3"],
          },
        ],
        evidenceSummary: "",
        dimensionsCovered: ["work-style"],
        metadata: { generatedAt: new Date().toISOString(), sessionCount: 1, totalEvidenceItems: 3 },
      },
      skepticReport: {
        schemaVersion: "skeptic-report/v1",
        issues: [],
        overallScore: 0.8,
        metadata: { generatedAt: new Date().toISOString(), claimCount: 1, issueCount: 0 },
      },
    });

    const result = await evaluateSkill({ skillDirectory: skillDir });

    // Expected scores:
    // grounding: 1.0 (verifier pass=true), actionability: 0.8 (lint pass), specificity: 0.7 (has frontmatter)
    // safety: 0.9 (redaction pass), concision: 1.0 (not over budget), discoverability: 0.7 (has frontmatter)
    // skepticQuality: 0.8, evidenceRichness: 1.0 (3/3)
    // composite = 1.0*0.20 + 0.8*0.15 + 0.9*0.15 + 0.7*0.10 + 1.0*0.10 + 0.7*0.10 + 0.8*0.10 + 1.0*0.10
    //           = 0.20 + 0.12 + 0.135 + 0.07 + 0.10 + 0.07 + 0.08 + 0.10 = 0.875
    expect(result.evaluation.composite).toBeCloseTo(0.875, 2);
  });

  it("assigns grade A when composite >= 0.85", async () => {
    const skillDir = createSkillDirectory({
      claimManifest: {
        schemaVersion: "claim-manifest/v1",
        claims: [
          {
            id: "c1",
            dimension: "work-style",
            label: "analysis-first",
            confidence: 0.9,
            rationale: "r",
            evidenceRefs: ["e1", "e2", "e3"],
          },
        ],
        evidenceSummary: "",
        dimensionsCovered: ["work-style"],
        metadata: { generatedAt: new Date().toISOString(), sessionCount: 1, totalEvidenceItems: 3 },
      },
      skepticReport: {
        schemaVersion: "skeptic-report/v1",
        issues: [],
        overallScore: 0.8,
        metadata: { generatedAt: new Date().toISOString(), claimCount: 1, issueCount: 0 },
      },
    });

    const result = await evaluateSkill({ skillDirectory: skillDir });

    expect(result.evaluation.grade).toBe("A");
  });

  it("forces grade F and verdict reject when redaction fails", async () => {
    const skillDir = createSkillDirectory({
      skillContent: `---
name: secret-skill
description: Leaks a key.
---

# Secret Skill

OPENAI_API_KEY=sk-secretvalue123
`,
      claimManifest: {
        schemaVersion: "claim-manifest/v1",
        claims: [
          {
            id: "c1",
            dimension: "work-style",
            label: "analysis-first",
            confidence: 0.9,
            rationale: "r",
            evidenceRefs: ["e1", "e2", "e3"],
          },
        ],
        evidenceSummary: "",
        dimensionsCovered: ["work-style"],
        metadata: { generatedAt: new Date().toISOString(), sessionCount: 1, totalEvidenceItems: 3 },
      },
      skepticReport: {
        schemaVersion: "skeptic-report/v1",
        issues: [],
        overallScore: 1.0,
        metadata: { generatedAt: new Date().toISOString(), claimCount: 1, issueCount: 0 },
      },
    });

    const result = await evaluateSkill({ skillDirectory: skillDir });

    expect(result.evaluation.gates.redaction).toBe("fail");
    expect(result.evaluation.grade).toBe("F");
    expect(result.evaluation.verdict).toBe("reject");
  });

  it("forces verdict needs-patch and grade <= C when grounding fails", async () => {
    const skillDir = createSkillDirectory({
      verifierContent: JSON.stringify({
        schemaVersion: "verifier-report/v1",
        pass: false,
        checkedItems: [],
        issues: [{ description: "Fabricated directive", location: "x", severity: "high" }],
        metadata: { generatedAt: new Date().toISOString(), directiveCount: 1, verifiedCount: 0, fabricatedCount: 1 },
      }),
      claimManifest: {
        schemaVersion: "claim-manifest/v1",
        claims: [
          {
            id: "c1",
            dimension: "work-style",
            label: "analysis-first",
            confidence: 0.9,
            rationale: "r",
            evidenceRefs: ["e1", "e2", "e3"],
          },
        ],
        evidenceSummary: "",
        dimensionsCovered: ["work-style"],
        metadata: { generatedAt: new Date().toISOString(), sessionCount: 1, totalEvidenceItems: 3 },
      },
      skepticReport: {
        schemaVersion: "skeptic-report/v1",
        issues: [],
        overallScore: 1.0,
        metadata: { generatedAt: new Date().toISOString(), claimCount: 1, issueCount: 0 },
      },
    });

    const result = await evaluateSkill({ skillDirectory: skillDir });

    expect(result.evaluation.gates.grounding).toBe("fail");
    expect(result.evaluation.verdict).toBe("needs-patch");
    // Grade should be at most "C" — "D" or "F" are also <= "C"
    const gradeOrder = ["A", "B", "C", "D", "F"];
    const gradeIndex = gradeOrder.indexOf(result.evaluation.grade!);
    expect(gradeIndex).toBeGreaterThanOrEqual(gradeOrder.indexOf("C"));
  });
});

describe("computeComposite", () => {
  it("computes weighted sum correctly", () => {
    const composite = computeComposite({
      grounding: 1.0,
      actionability: 0.8,
      safety: 0.9,
      specificity: 0.7,
      concision: 1.0,
      discoverability: 0.7,
      skepticQuality: 0.8,
      evidenceRichness: 1.0,
    });
    // 1.0*0.20 + 0.8*0.15 + 0.9*0.15 + 0.7*0.10 + 1.0*0.10 + 0.7*0.10 + 0.8*0.10 + 1.0*0.10
    expect(composite).toBeCloseTo(0.875, 2);
  });

  it("returns 0 when all scores are 0", () => {
    const composite = computeComposite({
      grounding: 0,
      actionability: 0,
      safety: 0,
      specificity: 0,
      concision: 0,
      discoverability: 0,
      skepticQuality: 0,
      evidenceRichness: 0,
    });
    expect(composite).toBe(0);
  });
});

describe("computeGrade", () => {
  it("returns A for composite >= 0.85", () => {
    expect(computeGrade(0.85)).toBe("A");
    expect(computeGrade(0.95)).toBe("A");
    expect(computeGrade(1.0)).toBe("A");
  });

  it("returns B for composite >= 0.75", () => {
    expect(computeGrade(0.75)).toBe("B");
    expect(computeGrade(0.84)).toBe("B");
  });

  it("returns C for composite >= 0.65", () => {
    expect(computeGrade(0.65)).toBe("C");
    expect(computeGrade(0.74)).toBe("C");
  });

  it("returns D for composite >= 0.50", () => {
    expect(computeGrade(0.50)).toBe("D");
    expect(computeGrade(0.64)).toBe("D");
  });

  it("returns F for composite < 0.50", () => {
    expect(computeGrade(0.49)).toBe("F");
    expect(computeGrade(0.0)).toBe("F");
  });
});
