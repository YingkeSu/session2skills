import type {
  MergedClaim,
  SkillDirective,
  SkillIntent,
  SkillIntentConfidence,
  SkillPlan,
  SkillTargetAgent,
  WorkflowSignalKind,
} from "../normalize/models.js";

import type { RankedMergedClaim } from "../analyze/claim-merge.js";

/**
 * Options for building a SkillIntent from a skill plan and merged claims.
 */
export type BuildSkillIntentOptions = {
  /** Override the generated name. Default: derived from skill plan title. */
  name?: string;
  /** Override the trigger phrase. Default: composed from skill plan overview. */
  trigger?: string;
  /** Target agent for the skill intent. Default: "generic". */
  targetAgent?: SkillTargetAgent;
  /** Override the problem class. Default: derived from the dominant workflow dimension. */
  problemClass?: string;
};

/**
 * Build a deterministic SkillIntent from an existing skill plan and its merged claims.
 *
 * This function does NOT invent new analysis — it maps existing structures
 * (sections, directives, claims) into the SkillIntent shape. Every field is
 * grounded in the skill plan or its supporting claims.
 */
export function buildSkillIntent(
  skillPlan: SkillPlan,
  acceptedClaims: ReadonlyArray<RankedMergedClaim>,
  tentativeClaims: ReadonlyArray<RankedMergedClaim>,
  options?: BuildSkillIntentOptions,
): SkillIntent {
  const allClaims = [...acceptedClaims, ...tentativeClaims];

  const name = options?.name ?? deriveName(skillPlan);
  const trigger = options?.trigger ?? deriveTrigger(skillPlan);
  const targetAgent = options?.targetAgent ?? "generic";
  const problemClass = options?.problemClass ?? deriveProblemClass(skillPlan, allClaims);

  const workflow = deriveWorkflow(skillPlan);
  const constraints = deriveConstraints(allClaims, skillPlan);
  const validation = deriveValidation(allClaims, skillPlan);
  const antiPatterns = deriveAntiPatterns(skillPlan);
  const evidenceClaimIDs = deriveEvidenceClaimIDs(allClaims);
  const confidence = deriveConfidence(acceptedClaims, tentativeClaims);

  return {
    schemaVersion: "skill-intent/v1",
    name,
    trigger,
    targetAgent,
    problemClass,
    workflow,
    constraints,
    validation,
    antiPatterns,
    evidenceClaimIDs,
    confidence,
  };
}

function deriveName(skillPlan: SkillPlan): string {
  const raw = skillPlan.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");

  const truncated = raw.slice(0, 64).replace(/-$/g, "");
  return truncated.length > 0 ? truncated : "personalized-workflow-skill";
}

function deriveTrigger(skillPlan: SkillPlan): string {
  const overview = skillPlan.overview.replace(/\.$/, "").trim();
  if (overview.length > 0) {
    return `Use when ${overview.charAt(0).toLowerCase()}${overview.slice(1)}`;
  }

  return "Use when working in the user's repository context and wanting execution style to mirror their established habits.";
}

function deriveProblemClass(
  skillPlan: SkillPlan,
  claims: ReadonlyArray<RankedMergedClaim>,
): string {
  const dimensions = new Set<WorkflowSignalKind>();
  for (const section of skillPlan.sections) {
    if (section.id !== "summary" && section.claimIDs.length > 0) {
      dimensions.add(section.id as WorkflowSignalKind);
    }
  }

  if (dimensions.has("work-style")) {
    return "Adapt agent execution style to match the user's observed coding workflow.";
  }
  if (dimensions.has("constraint")) {
    return "Apply observed constraints and avoid anti-patterns while modifying the codebase.";
  }
  if (dimensions.size > 0) {
    const listed = [...dimensions].join(", ").replace(/-/g, " ");
    return `Apply observed preferences for ${listed}.`;
  }

  return "Apply generated skill guidance as operating defaults for the user's codebase.";
}

function deriveWorkflow(skillPlan: SkillPlan): Array<string> {
  const steps: Array<string> = [];

  const workStyleDirectives = effectiveDirectives(skillPlan, "work-style");
  if (workStyleDirectives.length > 0) {
    for (const directive of workStyleDirectives) {
      steps.push(capitalizeSentence(directive.directive.replace(/\.$/, "")));
    }
  } else {
    const workStyleSection = skillPlan.sections.find((s) => s.id === "work-style");
    if (workStyleSection) {
      steps.push(workStyleSection.summary);
    }
  }

  if (steps.length === 0) {
    steps.push("Inspect context before making changes.");
    steps.push("Make the smallest cohesive change that satisfies the request.");
  }

  return steps;
}

function deriveConstraints(
  claims: ReadonlyArray<RankedMergedClaim>,
  skillPlan: SkillPlan,
): Array<string> {
  const constraints: Array<string> = [];

  const constraintDirectives = effectiveDirectives(skillPlan, "constraint");
  for (const directive of constraintDirectives) {
    constraints.push(capitalizeSentence(directive.directive.replace(/\.$/, "")));
  }

  if (constraints.length === 0) {
    const constraintClaims = claims.filter((c) => c.dimension === "constraint");
    for (const claim of constraintClaims.slice(0, 3)) {
      constraints.push(`Follow observed ${claim.normalizedLabel.replace(/-/g, " ")} behavior.`);
    }
  }

  return constraints;
}

function deriveValidation(
  claims: ReadonlyArray<RankedMergedClaim>,
  skillPlan: SkillPlan,
): Array<string> {
  const validation: Array<string> = [];

  const validationDirectives = effectiveDirectives(skillPlan, "validation-habit");
  for (const directive of validationDirectives) {
    validation.push(capitalizeSentence(directive.directive.replace(/\.$/, "")));
  }

  if (validation.length === 0) {
    const validationClaims = claims.filter((c) => c.dimension === "validation-habit");
    for (const claim of validationClaims.slice(0, 2)) {
      validation.push(`Run ${claim.normalizedLabel.replace(/-/g, " ")} after changes.`);
    }
  }

  if (validation.length === 0) {
    validation.push("Run the most relevant verification step before claiming completion.");
  }

  return validation;
}

function deriveAntiPatterns(skillPlan: SkillPlan): Array<string> {
  const antiPatterns: Array<string> = [];

  for (const sectionID of ["constraint", "work-style"] as const) {
    const fallbacks = skillPlan.fallbackDirectives[sectionID] ?? [];
    for (const fallback of fallbacks) {
      const text = fallback.directive.replace(/\.$/, "").trim();
      if (text.length > 0) {
        antiPatterns.push(capitalizeSentence(text));
      }
    }
  }

  const constraintDirectives = skillPlan.directives["constraint"] ?? [];
  for (const directive of constraintDirectives.slice(0, 2)) {
    antiPatterns.push(capitalizeSentence(`Do not violate: ${directive.directive.replace(/\.$/, "")}`));
  }

  if (antiPatterns.length === 0) {
    antiPatterns.push("Do not make broad refactors when the task is focused.");
    antiPatterns.push("Do not leave debug artifact language in generated output.");
  }

  return antiPatterns;
}

function deriveEvidenceClaimIDs(
  claims: ReadonlyArray<RankedMergedClaim>,
): Array<string> {
  return claims
    .flatMap((claim) => claim.sourceClaimIDs)
    .filter((id, index, array) => array.indexOf(id) === index)
    .sort();
}

function deriveConfidence(
  acceptedClaims: ReadonlyArray<RankedMergedClaim>,
  tentativeClaims: ReadonlyArray<RankedMergedClaim>,
): SkillIntentConfidence {
  const accepted = acceptedClaims.length;
  const tentative = tentativeClaims.length;
  const total = accepted + tentative;

  if (total === 0) {
    return "low";
  }

  const ratio = accepted / total;

  if (ratio >= 0.7 && accepted >= 3) {
    return "high";
  }
  if (ratio >= 0.4 || accepted >= 2) {
    return "medium";
  }
  return "low";
}

function effectiveDirectives(
  skillPlan: SkillPlan,
  sectionID: string,
): Array<SkillDirective> {
  const primary = skillPlan.directives[sectionID];
  if (primary && primary.length > 0) {
    return [...primary];
  }
  const fallback = skillPlan.fallbackDirectives[sectionID];
  if (fallback && fallback.length > 0) {
    return [...fallback];
  }
  return [];
}

function capitalizeSentence(text: string): string {
  if (text.length === 0) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
