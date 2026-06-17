import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { lintSkillMarkdown, type SkillLintIssueCode } from "./skill-lint.js";
import { containsSecretMaterial } from "../shared/redaction.js";
import type {
  SkillEvaluation,
  SkillEvaluationIssue,
  SkillEvaluationIssueSeverity,
  SkillGateStatus,
} from "../normalize/models.js";
import type { VerifierReport } from "../harness/types.js";

const SIZE_BUDGET = 120_000;

export type EvaluateSkillInput = {
  skillDirectory: string;
  skillFileName?: string;
  verifierReportFileName?: string;
  sizeBudget?: number;
};

export type EvaluateSkillResult = {
  evaluation: SkillEvaluation;
  skillMarkdown: string;
  verifierReport: VerifierReport | null;
};

export async function evaluateSkill(input: EvaluateSkillInput): Promise<EvaluateSkillResult> {
  const skillDir = path.resolve(input.skillDirectory);
  const skillFileName = input.skillFileName ?? "SKILL.md";
  const verifierFileName = input.verifierReportFileName ?? "verifier-report.json";
  const sizeBudget = input.sizeBudget ?? SIZE_BUDGET;

  const skillPath = path.join(skillDir, skillFileName);
  const verifierPath = path.join(skillDir, verifierFileName);

  const skillMarkdown = await readFile(skillPath, "utf8");
  const skillSize = Buffer.byteLength(skillMarkdown, "utf8");

  const lintIssues = lintSkillMarkdown(skillMarkdown);
  const hasSecrets = containsSecretMaterial(skillMarkdown);
  const hasEnvPayloadLintIssue = lintIssues.some((i) => i.code === "env-payload");
  const overBudget = skillSize > sizeBudget;

  let verifierReport: VerifierReport | null = null;
  try {
    const verifierRaw = await readFile(verifierPath, "utf8");
    verifierReport = JSON.parse(verifierRaw) as VerifierReport;
  } catch {
    verifierReport = null;
  }

  const issues: Array<SkillEvaluationIssue> = [];

  for (const lintIssue of lintIssues) {
    issues.push(mapLintIssueToEvaluationIssue(lintIssue));
  }

  if (hasSecrets) {
    issues.push({
      severity: "high",
      message: "SKILL.md contains obvious secret material.",
      location: "SKILL.md",
    });
  }

  if (overBudget) {
    issues.push({
      severity: "high",
      message: `SKILL.md exceeds size budget of ${sizeBudget} bytes (actual: ${skillSize} bytes).`,
      location: "SKILL.md",
    });
  }

  if (!verifierReport) {
    issues.push({
      severity: "medium",
      message: "No verifier report found. Grounding could not be confirmed.",
      location: verifierPath,
    });
  }

  const lintPass = lintIssues.length === 0;
  const redactionPass = !hasSecrets && !hasEnvPayloadLintIssue;
  const groundingPass = verifierReport !== null && verifierReport.pass === true;

  const gates = {
    lint: gateStatus(lintPass),
    redaction: gateStatus(redactionPass),
    grounding: gateStatus(groundingPass),
  };

  const scores = buildScores({
    lintPass,
    redactionPass,
    groundingPass,
    hasFrontmatterName: lintIssues.every((i) => i.code !== "missing-frontmatter-name"),
    hasFrontmatterDescription: lintIssues.every((i) => i.code !== "missing-frontmatter-description"),
    overBudget,
    skillSize,
    verifierReport,
  });

  const verdict = buildVerdict(gates, issues);

  const evaluation: SkillEvaluation = {
    schemaVersion: "skill-evaluation/v1",
    skillID: path.basename(skillDir),
    evaluatedAt: new Date().toISOString(),
    gates,
    scores,
    verdict,
    issues,
  };

  return { evaluation, skillMarkdown, verifierReport };
}

function gateStatus(pass: boolean): SkillGateStatus {
  return pass ? "pass" : "fail";
}

function buildScores(input: {
  lintPass: boolean;
  redactionPass: boolean;
  groundingPass: boolean;
  hasFrontmatterName: boolean;
  hasFrontmatterDescription: boolean;
  overBudget: boolean;
  skillSize: number;
  verifierReport: VerifierReport | null;
}): SkillEvaluation["scores"] {
  const grounding = input.groundingPass ? 1.0 : input.verifierReport ? 0.0 : 0.0;
  const actionability = input.lintPass ? 0.8 : 0.3;
  const hasFrontmatter = input.hasFrontmatterName && input.hasFrontmatterDescription;
  const specificity = hasFrontmatter ? 0.7 : 0.4;
  const safety = input.redactionPass ? 0.9 : 0.0;
  const concision = input.overBudget ? 0.5 : 1.0;
  const discoverability = hasFrontmatter ? 0.7 : 0.4;

  return {
    grounding,
    actionability,
    specificity,
    safety,
    concision,
    discoverability,
  };
}

function buildVerdict(
  gates: { lint: SkillGateStatus; redaction: SkillGateStatus; grounding: SkillGateStatus },
  issues: Array<SkillEvaluationIssue>,
): SkillEvaluation["verdict"] {
  if (gates.lint === "fail" || gates.redaction === "fail") {
    return "reject";
  }

  if (gates.grounding === "fail" || issues.some((issue) => issue.severity === "high")) {
    return "needs-patch";
  }

  return "pass";
}

function mapLintIssueToEvaluationIssue(lintIssue: { code: SkillLintIssueCode; message: string }): SkillEvaluationIssue {
  const severity = mapLintCodeToSeverity(lintIssue.code);
  return {
    severity,
    message: lintIssue.message,
    location: "SKILL.md",
  };
}

function mapLintCodeToSeverity(code: SkillLintIssueCode): SkillEvaluationIssueSeverity {
  switch (code) {
    case "missing-frontmatter":
      return "medium";
    case "missing-frontmatter-name":
      return "medium";
    case "missing-frontmatter-description":
      return "medium";
    case "debug-phrase":
      return "medium";
    case "report-prose":
      return "medium";
    case "secret-material":
      return "high";
    case "env-payload":
      return "high";
    default:
      return "low";
  }
}
