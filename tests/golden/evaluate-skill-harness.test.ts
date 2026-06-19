import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateSkill } from "../../src/generate/evaluate-skill.js";

const GOLDEN_DIR = path.join(import.meta.dirname, ".");

function createHarnessSkillDirectory(): string {
  const root = mkdtempSync(path.join(tmpdir(), "s2s-golden-eval-"));
  mkdirSync(root, { recursive: true });

  cpSync(path.join(GOLDEN_DIR, "SKILL-harness.md"), path.join(root, "SKILL.md"));
  cpSync(path.join(GOLDEN_DIR, "verifier-report-harness.json"), path.join(root, "verifier-report.json"));
  cpSync(path.join(GOLDEN_DIR, "claim-manifest-harness.json"), path.join(root, "claim-manifest.json"));
  cpSync(path.join(GOLDEN_DIR, "skeptic-report-harness.json"), path.join(root, "skeptic-report.json"));

  return root;
}

describe("golden: skill-evaluation-harness", () => {
  it("matches the golden 8-dimension evaluation output", async () => {
    const skillDir = createHarnessSkillDirectory();
    const result = await evaluateSkill({ skillDirectory: skillDir });

    const golden = JSON.parse(
      readFileSync(path.join(GOLDEN_DIR, "skill-evaluation-harness.json"), "utf8"),
    );

    const actual = {
      schemaVersion: result.evaluation.schemaVersion,
      gates: result.evaluation.gates,
      scores: result.evaluation.scores,
      composite: result.evaluation.composite,
      grade: result.evaluation.grade,
      verdict: result.evaluation.verdict,
      issues: result.evaluation.issues,
    };

    const expected = {
      schemaVersion: golden.schemaVersion,
      gates: golden.gates,
      scores: golden.scores,
      composite: golden.composite,
      grade: golden.grade,
      verdict: golden.verdict,
      issues: golden.issues,
    };

    expect(JSON.stringify(actual, null, 2)).toBe(JSON.stringify(expected, null, 2));
  });
});
