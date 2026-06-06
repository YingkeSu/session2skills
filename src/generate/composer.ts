import type { ResolvedLlmProvider } from "../llm/provider.js";
import { generateTraceID } from "../llm/trace.js";
import type { LlmMessage } from "../llm/types.js";
import type {
  LLMFinishReason,
  LLMTrace,
  SkillDirective,
  SkillPlan,
  SkillPlanSection,
} from "../normalize/models.js";
import type { TonePreset } from "../shared/cli.js";

export type SkillComposerBudget = {
  temperature: number;
  maxOutputTokens: number;
  timeoutMs?: number;
};

export type ComposeSkillViaLLMOptions = {
  promptName?: string;
  signal?: AbortSignal;
};

export type ComposedSkillSection = {
  id: string;
  title: string;
  summary: string;
  groundingClaimIDs: Array<string>;
  directives: Array<SkillDirective>;
};

export type ComposedSkillResult = {
  markdown: string;
  trace: LLMTrace;
  sections: Array<ComposedSkillSection>;
};

type RawComposedSkillSection = {
  id?: unknown;
  summary?: unknown;
  groundingClaimIDs?: unknown;
  directiveIDs?: unknown;
};

type RawComposedSkill = {
  title?: unknown;
  purpose?: unknown;
  sections?: unknown;
};

type SkillDocument = {
  name: string;
  title: string;
  description: string;
  purpose: string;
  sections: Array<ComposedSkillSection>;
};

const DEFAULT_SKILL_COMPOSER_BUDGET: Record<TonePreset, SkillComposerBudget> = {
  concise: {
    temperature: 0.1,
    maxOutputTokens: 500,
    timeoutMs: 20_000,
  },
  balanced: {
    temperature: 0.15,
    maxOutputTokens: 900,
    timeoutMs: 25_000,
  },
  detailed: {
    temperature: 0.2,
    maxOutputTokens: 1_400,
    timeoutMs: 30_000,
  },
};

export async function composeSkillViaLLM(
  skillPlan: SkillPlan,
  tone: TonePreset,
  budget: Partial<SkillComposerBudget> | undefined,
  llmClient: ResolvedLlmProvider,
  options: ComposeSkillViaLLMOptions = {},
): Promise<ComposedSkillResult> {
  const resolvedBudget = resolveComposerBudget(tone, budget);
  const promptName = options.promptName ?? "compose-skill";
  const traceID = generateTraceID();
  const inputPacket = buildComposerInput(skillPlan, tone);
  const messages: Array<LlmMessage> = [
    {
      role: "system",
      content: buildSystemPrompt(tone),
    },
    {
      role: "user",
      content: JSON.stringify(inputPacket, null, 2),
    },
  ];

  const result = await llmClient.provider.generateStructured<RawComposedSkill>({
    model: llmClient.model,
    messages,
    temperature: resolvedBudget.temperature,
    maxOutputTokens: resolvedBudget.maxOutputTokens,
    options: {
      timeoutMs: resolvedBudget.timeoutMs,
      signal: options.signal,
    },
    schema: {
      name: "skill_markdown_plan",
      description: "Grounded SKILL.md prose using only supplied section, claim, and directive identifiers.",
      schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          purpose: { type: "string" },
          sections: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                summary: { type: "string" },
                groundingClaimIDs: {
                  type: "array",
                  items: { type: "string" },
                },
                directiveIDs: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["id", "summary", "groundingClaimIDs", "directiveIDs"],
            },
          },
        },
        required: ["purpose", "sections"],
      },
      parse: parseRawComposedSkill,
    },
  });

  const document = validateAndNormalizeComposition(skillPlan, result.object);

  return {
    markdown: renderSkillDocumentMarkdown(document, tone),
    trace: {
      schemaVersion: "llm-trace/v1",
      traceID,
      timestamp: new Date().toISOString(),
      promptSetVersion: skillPlan.promptSetVersion,
      stage: "skill-plan",
      provider: result.metadata.provider,
      model: result.metadata.model,
      request: {
        promptName,
        messages,
        parameters: {
          tone,
          temperature: resolvedBudget.temperature,
          maxOutputTokens: resolvedBudget.maxOutputTokens,
        },
      },
      response: {
        finishReason: normalizeFinishReason(result.finishReason),
        rawText: result.rawText,
        structuredOutput: {
          kind: "skill-plan",
          plan: skillPlan,
        },
      },
      usage: result.metadata.usage,
    },
    sections: document.sections,
  };
}

export function fallbackSkillRenderer(skillPlan: SkillPlan, tone: TonePreset): string {
  const document: SkillDocument = {
    name: toSkillName(skillPlan.title),
    title: toSkillDocumentTitle(skillPlan.title),
    description: buildSkillDescription(skillPlan),
    purpose: skillPlan.overview,
    sections: skillPlan.sections.map((section) => ({
      id: section.id,
      title: section.title,
      summary: section.summary,
      groundingClaimIDs: [...section.claimIDs],
      directives: resolveSectionDirectives(skillPlan, section.id),
    })),
  };

  return renderSkillDocumentMarkdown(document, tone);
}

function buildSystemPrompt(tone: TonePreset): string {
  return [
    "You are composing SKILL.md guidance for an AI coding assistant.",
    "Use only the supplied skill plan, claim IDs, and directive IDs.",
    "Do not invent or rewrite directives. The renderer will expand directive IDs into final instructions.",
    "The final renderer will add SKILL.md YAML frontmatter; only compose the instruction body fields requested by the schema.",
    "Every section must keep the exact section id from the input.",
    "Every section must reference only claim IDs listed for that section.",
    "Every section must return exactly the directive IDs listed in its effectiveDirectives array.",
    "Write summaries as grounded, imperative prose that is more actionable than generic preference bullets.",
    `Tone preset: ${tone}.`,
  ].join("\n");
}

function buildComposerInput(skillPlan: SkillPlan, tone: TonePreset): Record<string, unknown> {
  return {
    tone,
    title: toSkillDocumentTitle(skillPlan.title),
    overview: skillPlan.overview,
    sections: skillPlan.sections.map((section) => ({
      id: section.id,
      title: section.title,
      summary: section.summary,
      claimIDs: section.claimIDs,
      effectiveDirectives: resolveSectionDirectives(skillPlan, section.id).map((directive) => ({
        id: directive.id,
        directive: directive.directive,
        claimIDs: directive.claimIDs,
      })),
    })),
  };
}

function parseRawComposedSkill(value: unknown): RawComposedSkill {
  if (!value || typeof value !== "object") {
    return { sections: [] };
  }

  const object = value as Record<string, unknown>;
  return {
    title: object.title,
    purpose: object.purpose,
    sections: Array.isArray(object.sections) ? object.sections : [],
  };
}

function validateAndNormalizeComposition(skillPlan: SkillPlan, raw: RawComposedSkill): SkillDocument {
  const purpose = normalizeText(raw.purpose) ?? skillPlan.overview;
  const title = normalizeText(raw.title) ?? toSkillDocumentTitle(skillPlan.title);
  const sectionLookup = new Map<string, SkillPlanSection>(
    skillPlan.sections.map((section) => [section.id, section]),
  );
  const rawSections = normalizeRawSections(raw.sections);

  if (rawSections.size !== skillPlan.sections.length) {
    throw new Error("Composer returned an incomplete section set.");
  }

  for (const rawSectionID of rawSections.keys()) {
    if (!sectionLookup.has(rawSectionID)) {
      throw new Error(`Composer returned unsupported section id '${rawSectionID}'.`);
    }
  }

  return {
    name: toSkillName(skillPlan.title),
    title,
    description: buildSkillDescription(skillPlan),
    purpose,
    sections: skillPlan.sections.map((section) =>
      normalizeSectionComposition(skillPlan, section, rawSections.get(section.id)),
    ),
  };
}

function normalizeRawSections(sections: unknown): Map<string, RawComposedSkillSection> {
  if (!Array.isArray(sections)) {
    throw new Error("Composer returned sections in an invalid format.");
  }

  const normalized = new Map<string, RawComposedSkillSection>();
  for (const section of sections) {
    if (!section || typeof section !== "object") {
      throw new Error("Composer returned a malformed section.");
    }

    const object = section as RawComposedSkillSection;
    const id = normalizeText(object.id);
    if (!id) {
      throw new Error("Composer returned a section without an id.");
    }
    if (normalized.has(id)) {
      throw new Error(`Composer returned duplicate section id '${id}'.`);
    }

    normalized.set(id, object);
  }

  return normalized;
}

function normalizeSectionComposition(
  skillPlan: SkillPlan,
  section: SkillPlanSection,
  rawSection: RawComposedSkillSection | undefined,
): ComposedSkillSection {
  if (!rawSection) {
    throw new Error(`Composer omitted section '${section.id}'.`);
  }

  const summary = normalizeText(rawSection.summary);
  if (!summary) {
    throw new Error(`Composer returned an empty summary for '${section.id}'.`);
  }

  const directives = resolveSectionDirectives(skillPlan, section.id);
  const expectedDirectiveIDs = directives.map((directive) => directive.id).sort();
  const actualDirectiveIDs = toUniqueStringArray(rawSection.directiveIDs).sort();

  if (actualDirectiveIDs.length !== expectedDirectiveIDs.length) {
    throw new Error(`Composer returned the wrong directive count for '${section.id}'.`);
  }

  for (let index = 0; index < expectedDirectiveIDs.length; index += 1) {
    if (actualDirectiveIDs[index] !== expectedDirectiveIDs[index]) {
      throw new Error(`Composer returned unsupported directives for '${section.id}'.`);
    }
  }

  const allowedClaimIDs = new Set(section.claimIDs);
  const groundingClaimIDs = toUniqueStringArray(rawSection.groundingClaimIDs);
  if (!groundingClaimIDs.every((claimID) => allowedClaimIDs.has(claimID))) {
    throw new Error(`Composer returned unsupported claim ids for '${section.id}'.`);
  }
  if (section.claimIDs.length > 0 && groundingClaimIDs.length === 0) {
    throw new Error(`Composer failed to ground '${section.id}' in allowed claims.`);
  }

  return {
    id: section.id,
    title: section.title,
    summary,
    groundingClaimIDs,
    directives,
  };
}

function renderSkillDocumentMarkdown(document: SkillDocument, tone: TonePreset): string {
  const lines: Array<string> = [
    "---",
    `name: ${document.name}`,
    `description: ${quoteYamlString(document.description)}`,
    "---",
    "",
    `# ${document.title}`,
    "",
    "## When To Use",
    "- Use this skill when coding in the user's repository and the task benefits from matching their established workflow preferences.",
    "- Do not use this skill for unrelated general questions, non-coding tasks, or when the user gives instructions that conflict with these defaults.",
    "",
    "## Operating Principles",
    document.purpose,
    "",
  ];

  for (const section of document.sections) {
    if (shouldSkipSection(section, tone)) {
      continue;
    }

    lines.push(`## ${section.title}`);
    lines.push(section.summary);

    if (section.directives.length > 0) {
      lines.push("");
      for (const directive of section.directives) {
        lines.push(`- ${directive.directive}`);
        if (tone === "detailed") {
          const grounding = buildGroundingSummary(directive, section.groundingClaimIDs);
          if (grounding) {
            lines.push(`  - Grounding: ${grounding}`);
          }
        }
      }
    } else if (tone === "detailed" && section.groundingClaimIDs.length > 0) {
      lines.push("");
      lines.push(`- Grounded in claim IDs: ${section.groundingClaimIDs.join(", ")}`);
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

function shouldSkipSection(section: ComposedSkillSection, tone: TonePreset): boolean {
  return tone !== "detailed" && section.id === "summary" && section.directives.length === 0;
}

function buildGroundingSummary(directive: SkillDirective, sectionGroundingClaimIDs: Array<string>): string | null {
  const claimIDs = directive.claimIDs.length > 0
    ? directive.claimIDs
    : sectionGroundingClaimIDs;
  const parts: Array<string> = [];

  if (claimIDs.length > 0) {
    parts.push(`claim IDs: ${claimIDs.join(", ")}`);
  }
  if (directive.evidenceSummary) {
    parts.push(directive.evidenceSummary);
  }

  return parts.length > 0 ? parts.join(" — ") : null;
}

function resolveSectionDirectives(skillPlan: SkillPlan, sectionID: string): Array<SkillDirective> {
  return skillPlan.directives[sectionID] && skillPlan.directives[sectionID]!.length > 0
    ? [...skillPlan.directives[sectionID]!]
    : [...(skillPlan.fallbackDirectives[sectionID] ?? [])];
}

function toUniqueStringArray(value: unknown): Array<string> {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();
  for (const item of value) {
    const normalized = normalizeText(item);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveComposerBudget(
  tone: TonePreset,
  budget?: Partial<SkillComposerBudget>,
): SkillComposerBudget {
  return {
    ...DEFAULT_SKILL_COMPOSER_BUDGET[tone],
    ...budget,
  };
}

function normalizeFinishReason(reason: string | undefined): LLMFinishReason {
  if (
    reason === "stop"
    || reason === "length"
    || reason === "content-filter"
    || reason === "tool-call"
    || reason === "error"
  ) {
    return reason;
  }

  return "unknown";
}

function toSkillDocumentTitle(title: string): string {
  return title.endsWith(" Plan") ? title.slice(0, -5) : title;
}

function toSkillName(title: string): string {
  const normalized = toSkillDocumentTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");

  const truncated = normalized.slice(0, 64).replace(/-$/g, "");
  return truncated.length > 0 ? truncated : "personalized-workflow-skill";
}

function buildSkillDescription(skillPlan: SkillPlan): string {
  const sectionNames = skillPlan.sections
    .filter((section) => section.id !== "summary")
    .map((section) => section.title.toLowerCase())
    .slice(0, 4)
    .join(", ");
  const scope = sectionNames.length > 0
    ? ` Covers ${sectionNames}.`
    : "";

  return [
    "Use this skill to adapt an AI coding agent to the user's observed repository workflow preferences.",
    "Use when planning, editing, debugging, refactoring, reviewing, or validating code in the user's repo.",
    "Do not use for unrelated general Q&A, non-coding tasks, or when the user gives conflicting explicit instructions.",
    scope,
  ].join(" ").replace(/\s+/g, " ").trim();
}

function quoteYamlString(value: string): string {
  return JSON.stringify(value);
}
