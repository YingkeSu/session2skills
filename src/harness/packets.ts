import type { LlmMessage, LlmStructuredOutputSchema } from "../llm/index.js";
import type { PromptRegistry } from "../llm/prompts/registry.js";
import type { EvidenceItem, NormalizedSession } from "../normalize/models.js";
import type { ClaimManifest } from "./types.js";
import { estimateTokens } from "../shared/evidence.js";
import { selectEvidenceForBudget } from "./evidence-index.js";

export type EvidenceConfig = {
  tokenBudget?: number;
  maxChars?: number;
  maxItems?: number;
  /**
   * Noise-filter cascade mode (issue #58). Levels:
   *   "off"                          — no filtering
   *   "structural"                   — strip injected skill bodies
   *   "structural+density"           — + low-density / repetition gate
   *   "structural+density+fuzzy"     — + MinHash+LSH near-duplicate dedup
   *   "all"                          — alias for the full cascade (fuzzy on)
   */
  filterMode?:
    | "off"
    | "structural"
    | "structural+density"
    | "structural+density+fuzzy"
    | "all";
  /** Jaccard similarity at/above which two blocks are near-duplicates (default 0.75). */
  minHashThreshold?: number;
  /** Minimum word count for the density gate (default 5). */
  minTextDensity?: number;
  /** Level-4 LLM classifier knob — reserved for a future slice (default false). */
  llmClassifierEnabled?: boolean;
};

export const DEFAULT_EVIDENCE_CONFIG: Required<EvidenceConfig> = {
  tokenBudget: 160000,
  maxChars: 5000,
  maxItems: 3000,
  filterMode: "off",
  minHashThreshold: 0.75,
  minTextDensity: 5,
  llmClassifierEnabled: false,
};

// ---------------------------------------------------------------------------
// Taxonomy (all 7 dimensions for harness pipeline)
// ---------------------------------------------------------------------------

const HARNESS_TAXONOMY: Array<{
  dimension: string;
  labels: ReadonlyArray<string>;
  description: string;
}> = [
  {
    dimension: "work-style",
    labels: ["analysis-first", "implementation-first", "iterative", "one-shot"],
    description:
      "How the developer approaches coding tasks: exploration-heavy vs action-heavy, iterative vs one-shot.",
  },
  {
    dimension: "communication-style",
    labels: ["concise", "explanatory", "consultative", "directive"],
    description:
      "How the developer communicates with the AI: terse vs verbose, asking vs commanding.",
  },
  {
    dimension: "validation-habit",
    labels: ["run-tests", "run-diagnostics", "check-git-state"],
    description:
      "How the developer verifies AI output: running tests, checking types, inspecting diffs.",
  },
  {
    dimension: "constraint",
    labels: ["minimal-diff", "preserve-patterns", "type-safety", "avoid-destructive-actions"],
    description:
      "Explicit or implicit constraints the developer places on AI behavior.",
  },
  {
    dimension: "token-efficiency",
    labels: ["explorer", "implementer", "analytical", "context-reuser"],
    description:
      "Token usage patterns: exploration vs implementation ratio, reasoning intensity, cache utilization.",
  },
  {
    dimension: "model-selection",
    labels: ["cost-conscious", "quality-focused", "adaptive"],
    description:
      "Model selection strategy: preference for cheaper vs premium models, adaptive switching.",
  },
  {
    dimension: "delegation-pattern",
    labels: ["hands-on", "trusting", "parallelizer"],
    description:
      "How the developer delegates to AI agents: manual control vs trusting delegation, parallelism preference.",
  },
];

// ---------------------------------------------------------------------------
// Packet types
// ---------------------------------------------------------------------------

export type HarnessPacket = {
  messages: Array<LlmMessage>;
  schema: LlmStructuredOutputSchema<unknown>;
  promptId: string;
  promptVersion: string;
};

// ---------------------------------------------------------------------------
// Prompt resolution helper
// ---------------------------------------------------------------------------

function resolveHarnessTemplate(
  registry: PromptRegistry | undefined,
  promptId: string,
  fallbackSystem: string,
  fallbackSchema: Record<string, unknown>,
): {
  systemPrompt: string;
  outputSchema: Record<string, unknown>;
  version: string;
} {
  if (registry) {
    const registered = registry.list().find((entry) => entry.id === promptId);
    if (registered) {
      const tmpl = registry.get(promptId, registered.version);
      return {
        systemPrompt: tmpl.systemPrompt,
        outputSchema: tmpl.outputSchema,
        version: tmpl.version,
      };
    }
  }
  return {
    systemPrompt: fallbackSystem,
    outputSchema: { ...fallbackSchema },
    version: "0.0.0",
  };
}

// ---------------------------------------------------------------------------
// Fallback system prompts
// ---------------------------------------------------------------------------

const FALLBACK_ANALYST_SYSTEM = [
  "You are an Evidence Analyst for developer behavior patterns.",
  "Extract candidate claims from session evidence.",
  "Cover all 7 taxonomy dimensions when evidence supports them.",
  "Each claim must cite specific evidence IDs.",
  "Assign confidence 0–1 based on evidence strength.",
  "Output valid JSON.",
].join("\n");

const FALLBACK_SKEPTIC_SYSTEM = [
  "You are a Skeptic reviewing a claim manifest.",
  "For each claim, verify evidence support and confidence appropriateness.",
  "Assign severity: high (drop), medium (adjust), low (note).",
  "Output valid JSON.",
].join("\n");

  const FALLBACK_WRITER_SYSTEM = [
    "You are writing a SKILL.md document from a claim manifest.",
    "The markdown must be an installable-style skill: YAML frontmatter with name and description, then concise agent-facing instructions.",
    "Every directive must reference a manifest claim ID.",
    "Do not add information not in the manifest.",
    "Do NOT include confidence scores, evidence IDs, claim IDs, or rationale text in the skillMarkdown. The output must contain ONLY agent-facing directives.",
    "Return structured sections whose directives exactly correspond to checkable instructions in the markdown.",
    "When evidence excerpts are provided for a claim, anchor each directive to the observed pattern.",
    "Prefer behavioral translations over abstract labels (e.g., 'Limit explanations to 2-3 sentences' not 'Be concise').",
    "Output valid JSON.",
  ].join("\n");

const FALLBACK_VERIFIER_SYSTEM = [
  "You are a Verifier cross-checking SKILL.md against a claim manifest.",
  "Verify every directive in the rendered markdown maps to a valid claim.",
  "Flag fabricated or unreferenced directives.",
  "Returning pass=true with zero checked directives is invalid when the markdown contains instructions.",
  "Output valid JSON.",
].join("\n");

// ---------------------------------------------------------------------------
// Evidence rendering
// ---------------------------------------------------------------------------

function renderEvidenceLines(items: ReadonlyArray<EvidenceItem>, maxChars: number = DEFAULT_EVIDENCE_CONFIG.maxChars): string {
  return [...items]
    .sort((a, b) => a.evidenceID.localeCompare(b.evidenceID))
    .map((item) => {
      const text = item.summaryText.length > maxChars
        ? item.summaryText.substring(0, maxChars) + "..."
        : item.summaryText;
      return `[${item.evidenceID}] (${item.citation.sourceType}) ${text}`;
    })
    .join("\n");
}

function renderTaxonomy(selectedDimensions?: ReadonlyArray<string>): string {
  const taxonomy = selectedDimensions
    ? HARNESS_TAXONOMY.filter((t) => selectedDimensions.includes(t.dimension))
    : HARNESS_TAXONOMY;
  return taxonomy.map(
    (t) => `### ${t.dimension}\nLabels: ${t.labels.join(", ")}\n${t.description}`,
  ).join("\n\n");
}

function renderSessionSummaries(sessions: ReadonlyArray<NormalizedSession>): string {
  return sessions
    .map((s) => `- [${s.id}] ${s.title} (${s.messages.length} messages, ${s.toolInvocations.length} tool calls)`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Stage 1: Analyst packet
// ---------------------------------------------------------------------------

export async function buildAnalystPacket(
  sessions: ReadonlyArray<NormalizedSession>,
  evidence: ReadonlyArray<EvidenceItem>,
  registry?: PromptRegistry,
  tokenBudget: number = DEFAULT_EVIDENCE_CONFIG.tokenBudget,
  selectedDimensions?: ReadonlyArray<string>,
  evidenceConfig?: EvidenceConfig,
): Promise<HarnessPacket> {
  const resolved = resolveHarnessTemplate(
    registry,
    "harness-analyst",
    FALLBACK_ANALYST_SYSTEM,
    {},
  );

  const cfg = { ...DEFAULT_EVIDENCE_CONFIG, ...evidenceConfig };
  const effectiveTokenBudget = evidenceConfig?.tokenBudget ?? tokenBudget;

  const [sessionSection, taxonomySection] = await Promise.all([
    Promise.resolve(renderSessionSummaries(sessions)),
    Promise.resolve(renderTaxonomy(selectedDimensions)),
  ]);

  const fixedOverhead =
    estimateTokens(resolved.systemPrompt) +
    estimateTokens(taxonomySection) +
    estimateTokens(sessionSection);

  const evidenceBudget = Math.max(0, effectiveTokenBudget - fixedOverhead);
  const selectedEvidence = selectEvidenceForBudget(
    [...evidence],
    evidenceBudget,
    { preferDirectUser: true, maxItems: cfg.maxItems },
  );

  const evidenceSection = renderEvidenceLines(selectedEvidence, cfg.maxChars);

  const userPayload = [
    `# Sessions (${sessions.length})`,
    sessionSection,
    "",
    "## Taxonomy (7 dimensions)",
    taxonomySection,
    "",
    `## Evidence (${selectedEvidence.length} items)`,
    evidenceSection,
    "",
    "## Instructions",
    "Extract candidate claims from the evidence above.",
    "Use ONLY the taxonomy dimensions and labels listed.",
    "Cite evidence IDs exactly as they appear (e.g., ses_001:msg_001:part_001).",
    "Assign confidence 0–1 based on evidence strength and consistency across sessions.",
    "Cover ALL dimensions where evidence exists.",
  ].join("\n");

  return {
    messages: [
      { role: "system", content: resolved.systemPrompt },
      { role: "user", content: userPayload },
    ],
    schema: {
      name: "claim_manifest",
      description: "Structured claim manifest from evidence analysis.",
      schema: resolved.outputSchema,
      parse: (value: unknown) => value,
    },
    promptId: "harness-analyst",
    promptVersion: resolved.version,
  };
}

// ---------------------------------------------------------------------------
// Stage 2: Skeptic packet
// ---------------------------------------------------------------------------

export function buildSkepticPacket(
  manifest: ClaimManifest,
  evidence: ReadonlyArray<EvidenceItem>,
  registry?: PromptRegistry,
  preComputedEvidence?: ReadonlyArray<EvidenceItem>,
  cachedClaimsJson?: string,
): HarnessPacket {
  const resolved = resolveHarnessTemplate(
    registry,
    "harness-skeptic",
    FALLBACK_SKEPTIC_SYSTEM,
    {},
  );

  const manifestJson = cachedClaimsJson ?? JSON.stringify(
    {
      claims: manifest.claims.map((c) => ({
        id: c.id,
        dimension: c.dimension,
        label: c.label,
        confidence: c.confidence,
        rationale: c.rationale,
        evidenceRefs: c.evidenceRefs,
      })),
    },
    null,
    2,
  );

  const evidenceSource = preComputedEvidence ?? evidence;
  const relevantEvidenceIds = new Set(
    manifest.claims.flatMap((c) => c.evidenceRefs),
  );
  const relevantEvidence = evidenceSource.filter((e) => relevantEvidenceIds.has(e.evidenceID));
  const evidenceSection = renderEvidenceLines(relevantEvidence);

  const userPayload = [
    "# Claim Manifest to Review",
    "```json",
    manifestJson,
    "```",
    "",
    `# Referenced Evidence (${relevantEvidence.length} items)`,
    evidenceSection,
    "",
    "## Instructions",
    "Review each claim in the manifest.",
    "For each issue found, specify the claimId, severity, and problem type.",
    "Be critical but fair. Only flag genuine problems.",
  ].join("\n");

  return {
    messages: [
      { role: "system", content: resolved.systemPrompt },
      { role: "user", content: userPayload },
    ],
    schema: {
      name: "skeptic_report",
      description: "Structured critique of the claim manifest.",
      schema: resolved.outputSchema,
      parse: (value: unknown) => value,
    },
    promptId: "harness-skeptic",
    promptVersion: resolved.version,
  };
}

// ---------------------------------------------------------------------------
// Stage 3: Writer packet
// ---------------------------------------------------------------------------

export function buildWriterPacket(
  manifest: ClaimManifest,
  tone: string,
  registry?: PromptRegistry,
  evidence?: ReadonlyArray<EvidenceItem>,
  templateMarkdown?: string,
  skillTypeFocus?: string,
  preComputedEvidence?: ReadonlyArray<EvidenceItem>,
): HarnessPacket {
  const resolved = resolveHarnessTemplate(
    registry,
    "harness-writer",
    FALLBACK_WRITER_SYSTEM,
    {},
  );

  const evidenceSource = preComputedEvidence ?? evidence;
  const evidenceLookup = new Map((evidenceSource ?? []).map((e) => [e.evidenceID, e]));

  const manifestJson = JSON.stringify(
    manifest.claims.map((c) => {
      const base: Record<string, unknown> = {
        id: c.id,
        dimension: c.dimension,
        label: c.label,
        confidence: c.confidence,
        rationale: c.rationale,
        evidenceRefs: c.evidenceRefs,
      };

      if (evidenceLookup.size > 0) {
        const excerpts = c.evidenceRefs
          .map((refId) => evidenceLookup.get(refId))
          .filter((item): item is EvidenceItem => item !== undefined)
          .map((item) => ({
            id: item.evidenceID,
            sourceType: item.citation.sourceType,
            excerpt:
              item.summaryText.length > 200
                ? item.summaryText.substring(0, 200) + "..."
                : item.summaryText,
          }));
        if (excerpts.length > 0) {
          base.evidenceExcerpts = excerpts;
        }
      }

      return base;
    }),
    null,
    2,
  );

  const userPayload = [
    `# Claim Manifest (${manifest.claims.length} claims)`,
    "```json",
    manifestJson,
    "```",
    "",
    `## Dimensions Covered: ${manifest.dimensionsCovered.join(", ")}`,
    `## Tone: ${tone}`,
    "",
    templateMarkdown
      ? [
          "## Structural Template Reference",
          "Use this skill file as a structural template for the output format. Match its section style, heading levels, and frontmatter:",
          "```",
          templateMarkdown,
          "```",
          "",
        ].join("\n")
      : "",
    "## Instructions",
    skillTypeFocus
      ? `Generate a ${tone} skill focused on ${skillTypeFocus}.`
      : "Write installable-style SKILL.md guidance using ONLY the claims above.",
    "The markdown must start with YAML frontmatter containing name and description.",
    "The markdown body must be agent-facing operating instructions, not a claim/confidence report.",
    "Do NOT include confidence scores, evidence IDs, claim IDs, or rationale text in the skillMarkdown. The output must contain ONLY agent-facing directives.",
    "Each directive must have a sourceClaimId matching a claim id in the manifest.",
    "Each structured directive must appear as a checkable instruction in the markdown body.",
    "Group by dimension into sections.",
    "Write imperative, actionable prose.",
  ].join("\n");

  return {
    messages: [
      { role: "system", content: resolved.systemPrompt },
      { role: "user", content: userPayload },
    ],
    schema: {
      name: "writer_output",
      description: "SKILL.md with structured section/claim mapping.",
      schema: resolved.outputSchema,
      parse: (value: unknown) => value,
    },
    promptId: "harness-writer",
    promptVersion: resolved.version,
  };
}

// ---------------------------------------------------------------------------
// Stage 4: Verifier packet
// ---------------------------------------------------------------------------

export function buildVerifierPacket(
  skillMarkdown: string,
  manifest: ClaimManifest,
  registry?: PromptRegistry,
  cachedClaimsJson?: string,
): HarnessPacket {
  const resolved = resolveHarnessTemplate(
    registry,
    "harness-verifier",
    FALLBACK_VERIFIER_SYSTEM,
    {},
  );

  const manifestClaimsJson = cachedClaimsJson ?? JSON.stringify(
    manifest.claims.map((c) => ({
      id: c.id,
      dimension: c.dimension,
      label: c.label,
      confidence: c.confidence,
      rationale: c.rationale,
      evidenceRefs: c.evidenceRefs,
    })),
    null,
    2,
  );

  const userPayload = [
    "# SKILL.md to Verify",
    "```markdown",
    skillMarkdown,
    "```",
    "",
    "# Source Claim Manifest",
    "```json",
    manifestClaimsJson,
    "```",
    "",
    "## Instructions",
    "Cross-check every directive or instruction line in SKILL.md against the manifest claims.",
    "Every checkedItems entry must correspond to text that actually appears in the rendered markdown.",
    "Mark each directive as: verified, unreferenced, or fabricated.",
    "Set pass=true only if every rendered directive was checked and every checked directive is verified.",
    "If SKILL.md contains directives but checkedItems is empty, pass must be false.",
  ].join("\n");

  return {
    messages: [
      { role: "system", content: resolved.systemPrompt },
      { role: "user", content: userPayload },
    ],
    schema: {
      name: "verifier_report",
      description: "Cross-check report for SKILL.md against claim manifest.",
      schema: resolved.outputSchema,
      parse: (value: unknown) => value,
    },
    promptId: "harness-verifier",
    promptVersion: resolved.version,
  };
}
