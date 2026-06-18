import type { EvidenceItem, LLMTrace } from "../normalize/models.js";
import type { ResolvedLlmProvider } from "../llm/provider.js";
import type { PromptRegistry } from "../llm/prompts/registry.js";
import type { ClaimManifest, HarnessBudget, ManifestClaim, WriterOutput, WriterSection } from "./types.js";
import { buildWriterPacket } from "./packets.js";
import { resolveHarnessBudget } from "./stage-runner.js";

type RawWriterOutput = {
  skillMarkdown?: unknown;
  skill_markdown?: unknown;
  sections?: Array<{
    title?: unknown;
    summary?: unknown;
    directives?: Array<{
      text?: unknown;
      sourceClaimId?: unknown;
      source_claim_id?: unknown;
      claim_id?: unknown;
    }>;
    groundingClaimIds?: unknown;
    grounding_claim_ids?: unknown;
    claim_ids?: unknown;
  }>;
};

export type WriterStageResult = {
  output: WriterOutput;
  trace: LLMTrace;
};

export async function runWriterStage(
  manifest: ClaimManifest,
  tone: string,
  provider: ResolvedLlmProvider,
  registry?: PromptRegistry,
  budget?: Partial<HarnessBudget>,
  evidence?: ReadonlyArray<EvidenceItem>,
): Promise<WriterStageResult> {
  const resolvedBudget = resolveHarnessBudget(budget);
  const packet = buildWriterPacket(manifest, tone, registry, evidence);

  const result = await provider.provider.generateStructured<RawWriterOutput>({
    model: provider.model,
    messages: packet.messages,
    temperature: resolvedBudget.temperature,
    maxOutputTokens: resolvedBudget.maxOutputTokens,
    options: { timeoutMs: resolvedBudget.timeoutMs },
    schema: {
      name: packet.schema.name,
      description: packet.schema.description,
      schema: packet.schema.schema,
      parse: (value: unknown): RawWriterOutput => {
        if (!value || typeof value !== "object") return {};
        return value as RawWriterOutput;
      },
    },
  });

  const output = parseWriterOutput(result.object, manifest);

  return {
    output,
    trace: {
      schemaVersion: "llm-trace/v1",
      traceID: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      promptSetVersion: "prompt-set/v1",
      stage: "harness-writer",
      provider: result.metadata.provider,
      model: result.metadata.model,
      inputArtifactRef: "harness:writer",
      request: {
        promptName: packet.promptId,
        messages: packet.messages.map((m) => ({ role: m.role, content: m.content })),
      },
      response: {
        finishReason: (result.finishReason as LLMTrace["response"]["finishReason"]) ?? "stop",
        rawText: result.rawText,
      },
      usage: result.metadata.usage,
    },
  };
}

function parseWriterOutput(raw: RawWriterOutput, manifest: ClaimManifest): WriterOutput {
  const validClaimIds = new Set(manifest.claims.map((c) => c.id));

  const rawMarkdown = raw.skillMarkdown ?? raw.skill_markdown;
  const initialMarkdown = typeof rawMarkdown === "string" && rawMarkdown.trim()
    ? rawMarkdown
    : buildFallbackMarkdown(manifest);

  const rawSections = Array.isArray(raw.sections) ? raw.sections : [];

  const parsedSections = rawSections
    .filter((s) => s.title && typeof s.title === "string")
    .map((s) => {
      const directives = (Array.isArray(s.directives) ? s.directives : [])
        .filter((d) => d.text && typeof d.text === "string")
        .map((d) => {
          const sourceClaimId = String(d.sourceClaimId ?? d.source_claim_id ?? d.claim_id ?? "");
          return {
            text: String(d.text).trim(),
            sourceClaimId,
          };
        })
        .filter((d) => d.text && validClaimIds.has(d.sourceClaimId));

      const rawGroundingIds = s.groundingClaimIds ?? s.grounding_claim_ids ?? s.claim_ids;
      const explicitGroundingClaimIds = (Array.isArray(rawGroundingIds) ? rawGroundingIds : [])
        .filter((id): id is string => typeof id === "string" && validClaimIds.has(id));
      const groundingClaimIds = uniqueStrings([
        ...explicitGroundingClaimIds,
        ...directives.map((d) => d.sourceClaimId),
      ]);

      return {
        title: String(s.title).trim(),
        summary: String(s.summary ?? "").trim(),
        directives,
        groundingClaimIds,
      };
    })
    .filter((s) => s.title && (s.summary || s.directives.length > 0 || s.groundingClaimIds.length > 0));

  const sections = ensureStructuredSections(parsedSections, manifest);
  const skillMarkdown = ensureSkillMarkdown(initialMarkdown, sections, manifest);

  return { skillMarkdown, sections };
}

export function buildFallbackMarkdown(manifest: ClaimManifest): string {
  const sections = buildSectionsFromClaims(manifest);
  const lines: Array<string> = [
    "---",
    "name: personalized-workflow",
    `description: ${yamlScalar(buildSkillDescription(manifest))}`,
    "---",
    "",
    "# Personalized Workflow Skill",
    "",
    "Use this skill when adapting coding-agent behavior to this user's observed workflow preferences. Treat these instructions as operating guidance, not as a report about the underlying evidence.",
    "",
  ];

  if (sections.length === 0) {
    lines.push("## Operating Guidance");
    lines.push("- Ask for the missing project context before inferring a workflow preference.");
    lines.push("- Keep recommendations grounded in the user's explicit request and local project instructions.");
    lines.push("");
    return lines.join("\n");
  }

  for (const section of sections) {
    lines.push(`## ${section.title}`);
    if (section.summary) {
      lines.push(section.summary);
      lines.push("");
    }
    for (const directive of section.directives) {
      lines.push(`- ${directive.text}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function ensureStructuredSections(
  sections: Array<WriterSection>,
  manifest: ClaimManifest,
): Array<WriterSection> {
  if (manifest.claims.length === 0) {
    return sections;
  }

  const directiveCount = sections.reduce((sum, section) => sum + section.directives.length, 0);
  if (sections.length > 0 && directiveCount > 0) {
    return sections;
  }

  return buildSectionsFromClaims(manifest);
}

function buildSectionsFromClaims(manifest: ClaimManifest): Array<WriterSection> {
  const claimsByDimension = new Map<string, Array<ManifestClaim>>();
  for (const claim of manifest.claims) {
    const current = claimsByDimension.get(claim.dimension) ?? [];
    current.push(claim);
    claimsByDimension.set(claim.dimension, current);
  }

  return [...claimsByDimension.entries()].map(([dimension, claims]) => ({
    title: titleForDimension(dimension),
    summary: summaryForClaims(claims),
    directives: claims.map((claim) => ({
      text: directiveForClaim(claim),
      sourceClaimId: claim.id,
    })),
    groundingClaimIds: claims.map((claim) => claim.id),
  }));
}

function ensureSkillMarkdown(
  markdown: string,
  sections: Array<WriterSection>,
  manifest: ClaimManifest,
): string {
  const withFrontmatter = ensureFrontmatter(markdown, manifest);
  const missingDirectives = sections
    .flatMap((section) => section.directives.map((directive) => ({
      sectionTitle: section.title,
      text: directive.text,
    })))
    .filter((directive) => !markdownContainsDirective(withFrontmatter, directive.text));

  if (missingDirectives.length === 0) {
    return withFrontmatter;
  }

  const lines = [withFrontmatter.trimEnd(), "", "## Verified Operating Instructions"];
  let currentSection = "";
  for (const directive of missingDirectives) {
    if (directive.sectionTitle !== currentSection) {
      currentSection = directive.sectionTitle;
      lines.push("", `### ${currentSection}`);
    }
    lines.push(`- ${directive.text}`);
  }

  return lines.join("\n") + "\n";
}

function ensureFrontmatter(markdown: string, manifest: ClaimManifest): string {
  const trimmed = markdown.trimStart();
  const frontmatterMatch = /^---\n([\s\S]*?)\n---\n?/.exec(trimmed);
  const description = buildSkillDescription(manifest);

  if (!frontmatterMatch) {
    return [
      "---",
      "name: personalized-workflow",
      `description: ${yamlScalar(description)}`,
      "---",
      "",
      markdown.trimStart(),
    ].join("\n");
  }

  const frontmatter = frontmatterMatch[1] ?? "";
  const body = trimmed.slice(frontmatterMatch[0].length);
  const lines = frontmatter.split("\n").filter((line) => line.trim());

  if (!lines.some((line) => /^name\s*:/.test(line))) {
    lines.unshift("name: personalized-workflow");
  }
  if (!lines.some((line) => /^description\s*:/.test(line))) {
    lines.push(`description: ${yamlScalar(description)}`);
  }

  return ["---", ...lines, "---", body].join("\n");
}

function buildSkillDescription(manifest: ClaimManifest): string {
  const dimensions = manifest.dimensionsCovered.length > 0
    ? manifest.dimensionsCovered.join(", ")
    : "workflow preferences";
  return `Use when adapting an AI coding assistant to this user's observed ${dimensions} patterns.`;
}

function directiveForClaim(claim: ManifestClaim): string {
  const behavior = humanizeLabel(claim.label);
  return `Prefer ${behavior} behavior for ${humanizeDimension(claim.dimension)} decisions.`;
}

function summaryForClaims(claims: Array<ManifestClaim>): string {
  const labels = claims.map((claim) => humanizeLabel(claim.label)).join(", ");
  return `Adapt this part of the workflow toward: ${labels}.`;
}

function titleForDimension(dimension: string): string {
  return humanizeDimension(dimension)
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function humanizeDimension(dimension: string): string {
  return dimension.replaceAll("-", " ");
}

function humanizeLabel(label: string): string {
  return label.replaceAll("-", " ");
}

function firstSentence(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const first = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
  return first.length > 180 ? first.slice(0, 177).trimEnd() + "..." : first;
}

function markdownContainsDirective(markdown: string, directive: string): boolean {
  const normalizedMarkdown = normalizeText(markdown);
  const normalizedDirective = normalizeText(directive);
  return normalizedDirective !== null && normalizedMarkdown.includes(normalizedDirective);
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function uniqueStrings(values: Array<string>): Array<string> {
  return [...new Set(values)];
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}
