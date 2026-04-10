import type { ResolvedLlmProvider } from "../llm/provider.js";
import { DEFAULT_PROMPT_SET_VERSION } from "../normalize/models.js";
import type { PreferenceProfile, ProfileV2, SkillDirective, SkillPlan, WorkflowSignal } from "../normalize/models.js";
import type { TonePreset } from "../shared/cli.js";
import {
  composeSkillViaLLM,
  fallbackSkillRenderer,
  type ComposedSkillResult,
  type SkillComposerBudget,
} from "./composer.js";

type RenderableProfile = (PreferenceProfile | ProfileV2) & { skillPlan?: SkillPlan };

export type RenderSkillOptions = {
  skillPlan?: SkillPlan;
  llmClient?: ResolvedLlmProvider;
  composerBudget?: Partial<SkillComposerBudget>;
};

export type RenderSkillResult = {
  markdown: string;
  renderer: "llm" | "fallback";
  reason?: string;
  trace?: ComposedSkillResult["trace"];
  skillPlan: SkillPlan;
};

const OVERVIEW_TEXT = "Use this skill when working in the user's repository context and you want your execution style to mirror their established OpenCode habits.";

const DIRECTIVE_TEXT: Record<string, string> = {
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
};

const SECTION_FALLBACKS = {
  "work-style": "Default to a conservative, inspect-first workflow if no stronger evidence exists.",
  "communication-style": "Prefer balanced, direct communication if no stronger evidence exists.",
  "validation-habit": "Run the most relevant verification step before claiming completion.",
  constraint: "Preserve existing patterns and avoid destructive changes unless explicitly requested.",
} as const;

export function renderSkill(profile: RenderableProfile, tone?: TonePreset): string;
export function renderSkill(
  profile: RenderableProfile,
  tone: TonePreset,
  options: RenderSkillOptions & { llmClient: ResolvedLlmProvider },
): Promise<string>;
export function renderSkill(
  profile: RenderableProfile,
  tone: TonePreset = "balanced",
  options?: RenderSkillOptions,
): string | Promise<string> {
  const skillPlan = resolveSkillPlan(profile, options?.skillPlan);

  if (!options?.llmClient) {
    return fallbackSkillRenderer(skillPlan, tone);
  }

  return renderSkillArtifact(profile, tone, options).then((result) => result.markdown);
}

export async function renderSkillArtifact(
  profile: RenderableProfile,
  tone: TonePreset = "balanced",
  options: RenderSkillOptions = {},
): Promise<RenderSkillResult> {
  const skillPlan = resolveSkillPlan(profile, options.skillPlan);

  if (options.llmClient) {
    try {
      const composed = await composeSkillViaLLM(
        skillPlan,
        tone,
        options.composerBudget,
        options.llmClient,
      );

      return {
        markdown: composed.markdown,
        renderer: "llm",
        trace: composed.trace,
        skillPlan,
      };
    } catch (error) {
      return {
        markdown: fallbackSkillRenderer(skillPlan, tone),
        renderer: "fallback",
        reason: error instanceof Error ? error.message : String(error),
        skillPlan,
      };
    }
  }

  return {
    markdown: fallbackSkillRenderer(skillPlan, tone),
    renderer: "fallback",
    skillPlan,
  };
}

function resolveSkillPlan(profile: RenderableProfile, providedSkillPlan?: SkillPlan): SkillPlan {
  return providedSkillPlan ?? profile.skillPlan ?? buildFallbackSkillPlan(profile);
}

function buildFallbackSkillPlan(profile: PreferenceProfile | ProfileV2): SkillPlan {
  const directives: Record<string, Array<SkillDirective>> = {};
  const fallbackDirectives: Record<string, Array<SkillDirective>> = {};
  const sections: SkillPlan["sections"] = [
    buildSection("work-style", "Preferred workflow", profile.workStyle, SECTION_FALLBACKS["work-style"], directives, fallbackDirectives),
    buildSection("communication-style", "Communication style", profile.communicationStyle, SECTION_FALLBACKS["communication-style"], directives, fallbackDirectives),
    buildSection("validation-habit", "Validation checklist", profile.validationHabits, SECTION_FALLBACKS["validation-habit"], directives, fallbackDirectives),
    buildSection("constraint", "Constraints and anti-patterns", profile.constraints, SECTION_FALLBACKS.constraint, directives, fallbackDirectives),
  ];

  if (profile.confidenceNotes.length > 0) {
    sections.push({
      id: "summary",
      title: "Confidence notes",
      summary: profile.confidenceNotes.map((note) => `- ${note}`).join("\n"),
      claimIDs: [],
    });
  }

  return {
    schemaVersion: "skill-plan/v1",
    planID: "plan:fallback-profile-render",
    promptSetVersion: "promptSetVersion" in profile
      ? profile.promptSetVersion
      : DEFAULT_PROMPT_SET_VERSION,
    title: "Personalized OpenCode Workflow Skill",
    overview: OVERVIEW_TEXT,
    sections,
    directives,
    fallbackDirectives,
  };
}

function buildSection(
  id: "work-style" | "communication-style" | "validation-habit" | "constraint",
  title: string,
  signals: Array<WorkflowSignal>,
  fallback: string,
  directives: Record<string, Array<SkillDirective>>,
  fallbackDirectives: Record<string, Array<SkillDirective>>,
): SkillPlan["sections"][number] {
  const effectiveSignals = dedupeSignals(signals);
  const sectionDirectives = effectiveSignals.map((signal) => toDirective(id, signal));

  if (sectionDirectives.length > 0) {
    directives[id] = sectionDirectives;
  } else {
    fallbackDirectives[id] = [
      {
        id: `fallback:${id}:default`,
        directive: fallback,
        evidenceSummary: "Fallback directive used because no stronger evidence was available",
        claimIDs: [],
        placement: "directive",
      },
    ];
  }

  return {
    id,
    title,
    summary: buildObservedSummary(effectiveSignals, fallback),
    claimIDs: [],
  };
}

function dedupeSignals(signals: Array<WorkflowSignal>): Array<WorkflowSignal> {
  const seen = new Set<string>();
  const deduped: Array<WorkflowSignal> = [];

  for (const signal of [...signals].sort((left, right) => right.weight - left.weight)) {
    if (seen.has(signal.value)) {
      continue;
    }
    seen.add(signal.value);
    deduped.push(signal);
  }

  return deduped;
}

function toDirective(sectionID: string, signal: WorkflowSignal): SkillDirective {
  return {
    id: `profile:${sectionID}:${signal.value}`,
    directive: DIRECTIVE_TEXT[signal.value] ?? `Favor ${signal.value.replace(/-/g, " ")} behavior`,
    evidenceSummary: signal.evidence.length > 0
      ? `${signal.evidence.length} evidence item(s), observed weight ${signal.weight.toFixed(2)}`
      : `Observed weight ${signal.weight.toFixed(2)}`,
    claimIDs: [],
    placement: "directive",
  };
}

function buildObservedSummary(signals: Array<WorkflowSignal>, fallback: string): string {
  if (signals.length === 0) {
    return fallback;
  }

  const summary = signals
    .slice(0, 3)
    .map((signal) => `${signal.value.replace(/-/g, " ")} (${signal.weight.toFixed(2)})`)
    .join(", ");

  return `Strongest observed tendencies: ${summary}.`;
}
