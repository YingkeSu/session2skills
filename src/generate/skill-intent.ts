import type {
  CandidateClaim,
  SkillIntent,
  SkillIntentConfidence,
  SkillPlan,
} from "../normalize/models.js";

export function deriveAntiPatterns(skillPlan: SkillPlan): Array<string> {
  const antiPatterns: Array<string> = [];
  for (const directives of Object.values(skillPlan.fallbackDirectives)) {
    for (const directive of directives) {
      antiPatterns.push(directive.directive);
    }
  }
  const constraints = skillPlan.directives["constraint"];
  if (constraints) {
    for (const directive of constraints) {
      const lower = directive.directive.toLowerCase();
      if (lower.includes("avoid") || lower.includes("do not")) {
        antiPatterns.push(directive.directive);
      }
    }
  }
  return antiPatterns;
}

export function deriveValidation(skillPlan: SkillPlan): Array<string> {
  const validation = skillPlan.directives["validation-habit"];
  if (validation && validation.length > 0) {
    return validation.map((directive) => directive.directive);
  }
  return ["Run typecheck and focused tests for changed behavior."];
}

export function deriveConstraints(skillPlan: SkillPlan): Array<string> {
  const constraints = skillPlan.directives["constraint"];
  if (constraints && constraints.length > 0) {
    return constraints.map((directive) => directive.directive);
  }
  return ["Preserve existing patterns and conventions."];
}

export function deriveWorkflow(skillPlan: SkillPlan): Array<string> {
  const workStyle = skillPlan.directives["work-style"];
  if (workStyle && workStyle.length > 0) {
    return workStyle.map((directive) => directive.directive);
  }
  const summarySection = skillPlan.sections.find((section) => section.id === "summary");
  if (summarySection && summarySection.summary.length > 0) {
    const lines = summarySection.summary.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length > 0) {
      return lines;
    }
  }
  return ["Make the smallest cohesive change that satisfies the request."];
}

export function deriveTrigger(skillPlan: SkillPlan): string {
  return skillPlan.overview.length > 0
    ? skillPlan.overview
    : "Use when performing work that matches this skill's domain.";
}

export function deriveName(skillPlan: SkillPlan): string {
  const slug = skillPlan.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const truncated = slug.slice(0, 64).replace(/-+$/g, "");
  return truncated.length > 0 ? truncated : "untitled-skill";
}

export function deriveEvidenceClaimIDs(
  accepted: Array<CandidateClaim>,
  tentative: Array<CandidateClaim>,
): Array<string> {
  const seen = new Set<string>();
  for (const claim of [...accepted, ...tentative]) {
    seen.add(claim.claimID);
  }
  return Array.from(seen).sort();
}

export function deriveConfidence(
  accepted: Array<CandidateClaim>,
  tentative: Array<CandidateClaim>,
): SkillIntentConfidence {
  const total = accepted.length + tentative.length;
  if (total === 0) {
    return "low";
  }
  const ratio = accepted.length / total;
  if (ratio >= 0.7 && accepted.length >= 3) {
    return "high";
  }
  if (ratio >= 0.4 || accepted.length >= 2) {
    return "medium";
  }
  return "low";
}

export function buildSkillIntent(
  skillPlan: SkillPlan,
  acceptedClaims: Array<CandidateClaim>,
  tentativeClaims: Array<CandidateClaim>,
): SkillIntent {
  return {
    schemaVersion: "skill-intent/v1",
    name: deriveName(skillPlan),
    trigger: deriveTrigger(skillPlan),
    targetAgent: "generic",
    problemClass: skillPlan.overview.length > 0 ? skillPlan.overview : "General development guidance.",
    workflow: deriveWorkflow(skillPlan),
    constraints: deriveConstraints(skillPlan),
    validation: deriveValidation(skillPlan),
    antiPatterns: deriveAntiPatterns(skillPlan),
    evidenceClaimIDs: deriveEvidenceClaimIDs(acceptedClaims, tentativeClaims),
    confidence: deriveConfidence(acceptedClaims, tentativeClaims),
  };
}
