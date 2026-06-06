import type {
  SkillDirective,
  SkillDirectivePlacement,
  SkillPlan,
  SkillPlanSection,
  SkillPlanSectionID,
  WorkflowSignalKind,
  PromptSetVersion,
} from "../normalize/models.js";

import type {
  RankedMergedClaim,
} from "../analyze/claim-merge.js";

const DIRECTIVE_PLACEMENT: Record<WorkflowSignalKind, Record<string, SkillDirectivePlacement>> = {
  "work-style": {
    "analysis-first": "directive",
    "implementation-first": "directive",
    "iterative": "directive",
    "one-shot": "directive",
  },
  "communication-style": {
    concise: "summary-only",
    explanatory: "summary-only",
    consultative: "summary-only",
    directive: "summary-only",
  },
  "validation-habit": {
    "run-tests": "directive",
    "run-diagnostics": "directive",
    "check-git-state": "directive",
  },
  constraint: {
    "minimal-diff": "directive",
    "preserve-patterns": "directive",
    "type-safety": "directive",
    "avoid-destructive-actions": "directive",
  },
  "token-efficiency": {
    explorer: "directive",
    implementer: "directive",
    analytical: "directive",
    "context-reuser": "directive",
  },
  "model-selection": {
    "cost-conscious": "directive",
    "quality-focused": "directive",
    adaptive: "directive",
  },
  "delegation-pattern": {
    "hands-on": "directive",
    trusting: "directive",
    parallelizer: "directive",
  },
};

const LABEL_TO_DIRECTIVE_TEXT: Record<string, string> = {
  "analysis-first": "Begin with code inspection and context gathering before making changes",
  "implementation-first": "Proceed directly to implementation with minimal preamble",
  iterative: "Work in small incremental steps and verify each step before proceeding",
  "one-shot": "Aim for complete, comprehensive solutions in a single pass",
  concise: "Keep responses brief and focused",
  explanatory: "Provide thorough explanations and reasoning for decisions",
  consultative: "Present options and let the user decide before acting",
  directive: "Take decisive action based on best judgment",
  "run-tests": "Run the test suite after making changes",
  "run-diagnostics": "Run type checking and linting diagnostics after changes",
  "check-git-state": "Verify git state before and after significant changes",
  "minimal-diff": "Make minimal, focused changes that solve the immediate problem",
  "preserve-patterns": "Maintain existing code patterns and conventions in all changes",
  "type-safety": "Prioritize type safety and avoid any usage in all changes",
  "avoid-destructive-actions": "Avoid destructive operations unless explicitly requested",
  explorer: "Explore codebase context thoroughly before making changes",
  implementer: "Focus on producing implementation output efficiently",
  analytical: "Take time for thorough analysis and reasoning before acting",
  "context-reuser": "Build on previously established context efficiently",
  "cost-conscious": "Prefer cost-effective model choices for routine tasks",
  "quality-focused": "Always use the highest-quality model available",
  adaptive: "Match model capability to task complexity",
  "hands-on": "Handle most tasks directly with minimal delegation",
  trusting: "Delegate tasks deeply to specialized sub-agents",
  parallelizer: "Launch parallel sub-agents for concurrent task execution",
};

const SECTION_TITLES: Record<WorkflowSignalKind, string> = {
  "work-style": "Workflow",
  "communication-style": "Communication",
  "validation-habit": "Validation",
  constraint: "Constraints",
  "token-efficiency": "Token Efficiency",
  "model-selection": "Model Selection",
  "delegation-pattern": "Delegation",
};

const SECTION_ORDER: Array<WorkflowSignalKind> = [
  "work-style",
  "communication-style",
  "validation-habit",
  "constraint",
  "token-efficiency",
  "model-selection",
  "delegation-pattern",
];

function makeFallbackDirective(section: string, text: string): SkillDirective {
  return {
    id: `fallback:${section}:default`,
    directive: text,
    evidenceSummary: "Insufficient evidence for a specific directive",
    claimIDs: [],
    placement: "directive",
  };
}

const FALLBACK_DIRECTIVES: Record<WorkflowSignalKind, Array<SkillDirective>> = {
  "work-style": [
    makeFallbackDirective(
      "work-style",
      "Default to a conservative, inspect-first workflow unless the user signals otherwise",
    ),
  ],
  "communication-style": [
    makeFallbackDirective(
      "communication-style",
      "Prefer balanced, direct communication unless the user signals otherwise",
    ),
  ],
  "validation-habit": [
    makeFallbackDirective(
      "validation-habit",
      "Run the most relevant verification step before claiming completion",
    ),
  ],
  constraint: [
    makeFallbackDirective(
      "constraint",
      "Preserve existing patterns and avoid destructive changes unless explicitly requested",
    ),
  ],
  "token-efficiency": [
    makeFallbackDirective(
      "token-efficiency",
      "Default to balanced token usage unless specific efficiency patterns are detected",
    ),
  ],
  "model-selection": [
    makeFallbackDirective(
      "model-selection",
      "Use the default model unless cost or quality signals suggest otherwise",
    ),
  ],
  "delegation-pattern": [
    makeFallbackDirective(
      "delegation-pattern",
      "Delegate when appropriate but verify sub-agent results",
    ),
  ],
};

export type BuildSkillPlanOptions = {
  promptSetVersion?: PromptSetVersion;
  title?: string;
  overview?: string;
  minClaimsPerSection?: number;
};

const DEFAULT_OPTIONS = {
  promptSetVersion: "prompt-set/v1" as PromptSetVersion,
  title: "Personalized Repository Workflow Skill",
  overview: "Apply these defaults as lightweight operating guidance while working in the user's codebase. Let the user's latest explicit instruction override any generated preference.",
  minClaimsPerSection: 1,
};

export function buildSkillPlan(
  acceptedClaims: ReadonlyArray<RankedMergedClaim>,
  tentativeClaims: ReadonlyArray<RankedMergedClaim>,
  options?: BuildSkillPlanOptions,
): SkillPlan {
  const resolved = { ...DEFAULT_OPTIONS, ...options };

  const allEligible = [...acceptedClaims, ...tentativeClaims].filter(
    (claim) => claim.status === "accepted" || claim.status === "tentative",
  );

  const directives: Record<string, Array<SkillDirective>> = {};
  const summaryClaimsBySection = new Map<string, Array<RankedMergedClaim>>();
  const sections: Array<SkillPlanSection> = [];

  for (const sectionID of SECTION_ORDER) {
    const sectionClaims = allEligible.filter((c) => c.dimension === sectionID);
    const { sectionDirectives, summaryClaims } = classifyClaims(sectionClaims, sectionID);

    if (sectionDirectives.length > 0) {
      directives[sectionID] = sectionDirectives;
    }

    if (summaryClaims.length > 0) {
      summaryClaimsBySection.set(sectionID, summaryClaims);
    }
  }

  const customDimensions = collectCustomDimensions(allEligible);
  for (const dimension of customDimensions) {
    const dimensionClaims = allEligible.filter((c) => c.dimension === dimension);
    const { sectionDirectives, summaryClaims } = classifyClaims(dimensionClaims, dimension);

    if (sectionDirectives.length > 0) {
      directives[dimension] = sectionDirectives;
    }
    if (summaryClaims.length > 0) {
      summaryClaimsBySection.set(dimension, summaryClaims);
    }
  }

  for (const sectionID of SECTION_ORDER) {
    const claimIDs = collectClaimIDs(allEligible, sectionID);
    const summaryText = buildSectionSummary(
      sectionID,
      directives[sectionID],
      summaryClaimsBySection.get(sectionID),
    );

    sections.push({
      id: sectionID,
      title: SECTION_TITLES[sectionID],
      summary: summaryText,
      claimIDs,
    });
  }

  const summarySection = buildSummaryOnlySection(summaryClaimsBySection);
  if (summarySection) {
    sections.push(summarySection);
  }

  for (const dimension of customDimensions) {
    const sectionID: SkillPlanSectionID = dimension.startsWith("custom:")
      ? dimension as SkillPlanSectionID
      : `custom:${dimension}` as SkillPlanSectionID;
    const claimIDs = collectClaimIDs(allEligible, dimension);
    sections.push({
      id: sectionID,
      title: dimension,
      summary: buildSectionSummary(dimension, directives[dimension], summaryClaimsBySection.get(dimension)),
      claimIDs,
    });
  }

  const fallbackDirectives = buildFallbackDirectives(directives, resolved.minClaimsPerSection);

  return {
    schemaVersion: "skill-plan/v1",
    planID: generatePlanID(),
    promptSetVersion: resolved.promptSetVersion,
    title: resolved.title,
    overview: resolved.overview,
    sections,
    directives,
    fallbackDirectives,
  };
}

type ClassificationResult = {
  sectionDirectives: Array<SkillDirective>;
  summaryClaims: Array<RankedMergedClaim>;
};

function classifyClaims(
  claims: ReadonlyArray<RankedMergedClaim>,
  sectionID: string,
): ClassificationResult {
  const directiveClaims: Array<RankedMergedClaim> = [];
  const summaryClaims: Array<RankedMergedClaim> = [];

  for (const claim of claims) {
    const placement = resolvePlacement(claim.dimension, claim.normalizedLabel);

    if (placement === "directive") {
      directiveClaims.push(claim);
    } else {
      summaryClaims.push(claim);
    }
  }

  const sectionDirectives = resolveDirectiveClaims(directiveClaims)
    .map((claim) => claimToDirective(claim, sectionID));

  return { sectionDirectives, summaryClaims };
}

function resolveDirectiveClaims(
  claims: ReadonlyArray<RankedMergedClaim>,
): Array<RankedMergedClaim> {
  const byLabel = new Map<string, RankedMergedClaim>();
  for (const claim of claims) {
    const existing = byLabel.get(claim.normalizedLabel);
    if (!existing || claim.confidence > existing.confidence) {
      byLabel.set(claim.normalizedLabel, claim);
    }
  }

  const resolved = [...byLabel.values()];
  removeWeakerContradiction(resolved, "analysis-first", "implementation-first");
  removeWeakerContradiction(resolved, "iterative", "one-shot");

  if (hasLabel(resolved, "analysis-first") && hasLabel(resolved, "one-shot")) {
    removeLabel(resolved, "one-shot");
  }

  return resolved.sort((left, right) => {
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }
    return left.normalizedLabel.localeCompare(right.normalizedLabel);
  });
}

function removeWeakerContradiction(
  claims: Array<RankedMergedClaim>,
  leftLabel: string,
  rightLabel: string,
): void {
  const left = claims.find((claim) => claim.normalizedLabel === leftLabel);
  const right = claims.find((claim) => claim.normalizedLabel === rightLabel);

  if (!left || !right) {
    return;
  }

  const remove = left.confidence >= right.confidence ? rightLabel : leftLabel;
  removeLabel(claims, remove);
}

function hasLabel(claims: ReadonlyArray<RankedMergedClaim>, label: string): boolean {
  return claims.some((claim) => claim.normalizedLabel === label);
}

function removeLabel(claims: Array<RankedMergedClaim>, label: string): void {
  const index = claims.findIndex((claim) => claim.normalizedLabel === label);
  if (index >= 0) {
    claims.splice(index, 1);
  }
}

function resolvePlacement(dimension: WorkflowSignalKind, label: string): SkillDirectivePlacement {
  return DIRECTIVE_PLACEMENT[dimension]?.[label] ?? "summary-only";
}

function claimToDirective(claim: RankedMergedClaim, sectionID: string): SkillDirective {
  const text = LABEL_TO_DIRECTIVE_TEXT[claim.normalizedLabel]
    ?? `Favor ${claim.label.replace(/-/g, " ")} behavior`;

  return {
    id: `directive:${sectionID}:${claim.normalizedLabel}`,
    directive: text,
    evidenceSummary: buildEvidenceSummary(claim),
    claimIDs: [claim.claimID],
    placement: "directive",
  };
}

function buildEvidenceSummary(claim: RankedMergedClaim): string {
  const sourceTypes = claim.sourceTypes.join(", ");
  const sessionCount = claim.sessionIDs.length;
  const evidenceCount = claim.evidenceCount;

  return `${sourceTypes} source(s), ${evidenceCount} evidence item(s) across ${sessionCount} session(s), confidence ${claim.confidence.toFixed(2)}`;
}

function buildFallbackDirectives(
  directives: Record<string, Array<SkillDirective>>,
  minClaimsPerSection: number,
): Record<string, Array<SkillDirective>> {
  const fallbacks: Record<string, Array<SkillDirective>> = {};

  for (const sectionID of SECTION_ORDER) {
    const sectionDirectives = directives[sectionID];
    const count = sectionDirectives?.length ?? 0;

    if (count < minClaimsPerSection) {
      fallbacks[sectionID] = [...FALLBACK_DIRECTIVES[sectionID]];
    }
  }

  return fallbacks;
}

function collectClaimIDs(
  claims: ReadonlyArray<RankedMergedClaim>,
  sectionID: string,
): Array<string> {
  return claims
    .filter((c) => c.dimension === sectionID)
    .flatMap((c) => c.sourceClaimIDs)
    .sort();
}

function buildSectionSummary(
  sectionID: string,
  sectionDirectives?: Array<SkillDirective>,
  summaryClaims?: Array<RankedMergedClaim>,
): string {
  const parts: Array<string> = [];

  if (sectionDirectives && sectionDirectives.length > 0) {
    parts.push(buildDirectiveSummary(sectionDirectives));
  }

  if (summaryClaims && summaryClaims.length > 0) {
    parts.push(buildObservationSummary(sectionID, summaryClaims));
  }

  if (parts.length === 0) {
    return defaultSectionSummary(sectionID);
  }

  return parts.join(" ");
}

function buildDirectiveSummary(sectionDirectives: ReadonlyArray<SkillDirective>): string {
  const directives = sectionDirectives.map((directive) =>
    directive.directive.replace(/\.$/, "").toLowerCase(),
  );

  if (directives.length === 1) {
    return `Default to this practice: ${directives[0]}.`;
  }

  return `Default to these practices: ${joinNaturalLanguage(directives)}.`;
}

function buildObservationSummary(
  sectionID: string,
  summaryClaims: ReadonlyArray<RankedMergedClaim>,
): string {
  const labels = summaryClaims.map((claim) => claim.normalizedLabel.replace(/-/g, " "));
  return `Treat ${joinNaturalLanguage(labels)} as a secondary ${sectionID.replace(/-/g, " ")} signal, and let explicit user instructions take precedence.`;
}

function defaultSectionSummary(sectionID: string): string {
  const summaries: Record<string, string> = {
    "work-style": "Use a conservative coding workflow: inspect enough context, make focused changes, and adapt when the user asks for a different pace.",
    "communication-style": "Keep communication balanced, direct, and useful without over-explaining routine steps.",
    "validation-habit": "Choose the most relevant verification for the files changed before reporting completion.",
    constraint: "Preserve existing project conventions and avoid destructive actions unless the user explicitly requests them.",
    "token-efficiency": "Spend context deliberately: gather what is needed, reuse known facts, and avoid unnecessary transcript-sized detail.",
    "model-selection": "Use the default model unless the task clearly needs a different cost, speed, or quality tradeoff.",
    "delegation-pattern": "Handle straightforward work directly and verify any delegated or parallel results before relying on them.",
  };

  return summaries[sectionID] ?? "Use this guidance only when it is relevant to the current coding task.";
}

function joinNaturalLanguage(items: ReadonlyArray<string>): string {
  if (items.length === 0) {
    return "";
  }
  if (items.length === 1) {
    return items[0]!;
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function buildSummaryOnlySection(
  summaryClaimsBySection: Map<string, Array<RankedMergedClaim>>,
): SkillPlanSection | null {
  const allSummaryClaims = [...summaryClaimsBySection.values()].flat();
  if (allSummaryClaims.length === 0) return null;

  const summaries: Array<string> = [];
  for (const [sectionID, claims] of summaryClaimsBySection) {
    const labels = claims.map((c) => c.normalizedLabel.replace(/-/g, " "));
    summaries.push(`${sectionID.replace(/-/g, " ")}: ${joinNaturalLanguage(labels)}`);
  }

  return {
    id: "summary",
    title: "Additional Grounding",
    summary: summaries.join("; "),
    claimIDs: allSummaryClaims.flatMap((c) => c.sourceClaimIDs).sort(),
  };
}

function collectCustomDimensions(claims: ReadonlyArray<RankedMergedClaim>): Array<string> {
  const standardDimensions = new Set<WorkflowSignalKind>(SECTION_ORDER);
  const custom = new Set<string>();

  for (const claim of claims) {
    if (!standardDimensions.has(claim.dimension)) {
      custom.add(claim.dimension);
    }
  }

  return [...custom].sort();
}

function generatePlanID(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `plan:${timestamp}-${random}`;
}
