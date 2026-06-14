import type {
  SkillDirective,
  SkillPlan,
  SkillPlanSection,
} from "../normalize/models.js";
import type { TonePreset } from "../shared/cli.js";

export type ComposedSkillSection = {
  id: string;
  title: string;
  summary: string;
  groundingClaimIDs: Array<string>;
  directives: Array<SkillDirective>;
};

type SkillDocument = {
  name: string;
  title: string;
  description: string;
  purpose: string;
  sections: Array<ComposedSkillSection>;
};

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
