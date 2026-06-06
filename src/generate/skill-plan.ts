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
  title: "Personalized Workflow Skill Plan",
  overview: "Directives derived from accepted and tentative claims about the user's observed workflow habits.",
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
  const sectionDirectives: Array<SkillDirective> = [];
  const summaryClaims: Array<RankedMergedClaim> = [];

  for (const claim of claims) {
    const placement = resolvePlacement(claim.dimension, claim.normalizedLabel);

    if (placement === "directive") {
      sectionDirectives.push(claimToDirective(claim, sectionID));
    } else {
      summaryClaims.push(claim);
    }
  }

  return { sectionDirectives, summaryClaims };
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
    parts.push(
      `${sectionDirectives.length} directive(s): ${sectionDirectives.map((d) => d.id.split(":").pop()).join(", ")}.`,
    );
  }

  if (summaryClaims && summaryClaims.length > 0) {
    const labels = summaryClaims.map((c) => c.label).join(", ");
    parts.push(`Summary-only observation(s): ${labels}.`);
  }

  if (parts.length === 0) {
    return `No strong evidence detected for ${sectionID}.`;
  }

  return parts.join(" ");
}

function buildSummaryOnlySection(
  summaryClaimsBySection: Map<string, Array<RankedMergedClaim>>,
): SkillPlanSection | null {
  const allSummaryClaims = [...summaryClaimsBySection.values()].flat();
  if (allSummaryClaims.length === 0) return null;

  const summaries: Array<string> = [];
  for (const [sectionID, claims] of summaryClaimsBySection) {
    const labels = claims.map((c) => `${c.label} (${c.confidence.toFixed(2)})`).join(", ");
    summaries.push(`${sectionID}: ${labels}`);
  }

  return {
    id: "summary",
    title: "Summary-only insights",
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
