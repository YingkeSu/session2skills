/**
 * Prompt packet builder for map-reduce extraction.
 *
 * Builds token-bounded prompt packets for:
 * - **Map stage**: per-session extraction of candidate claims
 * - **Reduce stage**: per-category synthesis of merged claims
 *
 * Packets are deterministic (same input → same packet) and evidence-first:
 * structured excerpts with IDs, not raw session dumps.
 */

import type {
  CandidateClaim,
  EvidenceItem,
  NormalizedSession,
  WorkflowSignalKind,
  WorkStyleLabel,
  CommunicationStyleLabel,
  ValidationHabitLabel,
  ConstraintLabel,
} from "../normalize/models.js";
import {
  estimateTokens,
  selectEvidenceForBudget,
} from "../analyze/evidence-index.js";
import type { PromptRegistry } from "./prompts/registry.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PacketMetadata = {
  tokenEstimate: number;
  budget: number;
  evidenceCount: number;
};

export type SessionMapPacket = {
  promptID: string;
  promptVersion: string;
  systemPrompt: string;
  userPayload: string;
  outputSchema: Record<string, unknown>;
  /** Evidence IDs actually included after budget selection. */
  includedEvidenceIDs: Array<string>;
  metadata: PacketMetadata & {
    sessionID: string;
  };
};

export type CategoryReducePacket = {
  promptID: string;
  promptVersion: string;
  systemPrompt: string;
  userPayload: string;
  outputSchema: Record<string, unknown>;
  /** Evidence IDs actually included after budget selection. */
  includedEvidenceIDs: Array<string>;
  metadata: PacketMetadata & {
    dimension: WorkflowSignalKind;
    sessionIDs: Array<string>;
  };
};

// ---------------------------------------------------------------------------
// Taxonomy definition (deterministic, ordered)
// ---------------------------------------------------------------------------

const TAXONOMY: Array<{
  kind: WorkflowSignalKind;
  labels: ReadonlyArray<string>;
  description: string;
}> = [
  {
    kind: "work-style",
    labels: [
      "analysis-first",
      "implementation-first",
      "iterative",
      "one-shot",
    ] as const satisfies ReadonlyArray<WorkStyleLabel>,
    description:
      "How the developer approaches coding tasks: exploration-heavy vs action-heavy, iterative vs one-shot.",
  },
  {
    kind: "communication-style",
    labels: [
      "concise",
      "explanatory",
      "consultative",
      "directive",
    ] as const satisfies ReadonlyArray<CommunicationStyleLabel>,
    description:
      "How the developer communicates with the AI: terse vs verbose, asking vs commanding.",
  },
  {
    kind: "validation-habit",
    labels: [
      "run-tests",
      "run-diagnostics",
      "check-git-state",
    ] as const satisfies ReadonlyArray<ValidationHabitLabel>,
    description:
      "How the developer verifies AI output: running tests, checking types, inspecting diffs.",
  },
  {
    kind: "constraint",
    labels: [
      "minimal-diff",
      "preserve-patterns",
      "type-safety",
      "avoid-destructive-actions",
    ] as const satisfies ReadonlyArray<ConstraintLabel>,
    description:
      "Explicit or implicit constraints the developer places on AI behavior.",
  },
];

// ---------------------------------------------------------------------------
// Output JSON contracts
// ---------------------------------------------------------------------------

const OUTPUT_CONTRACT_SESSION_MAP = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dimension: {
            type: "string",
            enum: TAXONOMY.map((t) => t.kind),
          },
          label: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          rationale: { type: "string" },
          evidenceIDs: { type: "array", items: { type: "string" } },
          counterEvidenceIDs: { type: "array", items: { type: "string" } },
        },
        required: [
          "dimension",
          "label",
          "confidence",
          "rationale",
          "evidenceIDs",
        ],
      },
    },
  },
  required: ["claims"],
} as const satisfies Record<string, unknown>;

const OUTPUT_CONTRACT_CATEGORY_REDUCE = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dimension: { type: "string" },
          label: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          rationale: { type: "string" },
          supportingEvidenceIDs: {
            type: "array",
            items: { type: "string" },
          },
          counterEvidenceIDs: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: [
          "dimension",
          "label",
          "confidence",
          "rationale",
          "supportingEvidenceIDs",
        ],
      },
    },
  },
  required: ["claims"],
} as const satisfies Record<string, unknown>;

// ---------------------------------------------------------------------------
// Prompt IDs and built-in fallbacks
// ---------------------------------------------------------------------------

/** Prompt ID used for the per-session map extraction stage. */
export const SESSION_MAP_PROMPT_ID = "session-extract-claims";

/** Prompt ID used for the per-category reduce synthesis stage. */
export const CATEGORY_REDUCE_PROMPT_ID = "category-synthesize-claims";

const FALLBACK_SESSION_MAP_SYSTEM = [
  "You are a developer behavior analyst.",
  "Extract candidate preference claims from a single coding session.",
  "Use ONLY the provided evidence. Cite evidence IDs exactly.",
  "Assign taxonomy dimension, label, confidence, and rationale for each claim.",
  "Report counter-evidence where the session contradicts a pattern.",
].join("\n");

const FALLBACK_CATEGORY_REDUCE_SYSTEM = [
  "You are a developer behavior analyst performing category-level synthesis.",
  "Merge candidate claims from multiple sessions into consensus claims for a single taxonomy dimension.",
  "Preserve the strongest evidence citations. Deduplicate overlapping claims.",
  "Drop claims that lack corroboration unless confidence is very high (>0.8).",
  "Output valid JSON matching the provided contract.",
].join("\n");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderTaxonomy(): string {
  return TAXONOMY.map(
    (t) => `### ${t.kind}\nLabels: ${t.labels.join(", ")}\n${t.description}`,
  ).join("\n\n");
}

function renderEvidenceLines(items: ReadonlyArray<EvidenceItem>): string {
  const sorted = stableSort(items, (a, b) =>
    a.evidenceID.localeCompare(b.evidenceID),
  );
  return sorted
    .map((item) => {
      const source = item.citation.sourceType;
      return `[${item.evidenceID}] (${source}) ${item.summaryText}`;
    })
    .join("\n");
}

function stableSort<T>(
  items: ReadonlyArray<T>,
  compare: (a: T, b: T) => number,
): Array<T> {
  return [...items].sort(compare);
}

function uniqueSorted(items: ReadonlyArray<string>): Array<string> {
  return [...new Set(items)].sort();
}

function resolveTemplate(
  registry: PromptRegistry | undefined,
  promptID: string,
  fallbackSystem: string,
  fallbackSchema: Record<string, unknown>,
): { systemPrompt: string; outputSchema: Record<string, unknown>; version: string } {
  if (registry) {
    const registeredPrompt = registry.list().find((entry) => entry.id === promptID);
    if (registeredPrompt) {
      const tmpl = registry.get(promptID, registeredPrompt.version);
      return {
        systemPrompt: tmpl.systemPrompt,
        outputSchema: tmpl.outputSchema,
        version: tmpl.version,
      };
    }
  }
  return { systemPrompt: fallbackSystem, outputSchema: { ...fallbackSchema }, version: "0.0.0" };
}

// ---------------------------------------------------------------------------
// Session map packet builder
// ---------------------------------------------------------------------------

/**
 * Build a prompt packet for the **map** stage: per-session claim extraction.
 *
 * Given a single session and its pre-filtered evidence items, assembles a
 * compact LLM input payload that includes:
 * - Taxonomy definitions for classification guidance
 * - Evidence items (sorted deterministically) with IDs for citation
 * - Output JSON contract
 * - Prompt template from registry (system prompt + schema) when available
 *
 * The packet is bounded by `budget` tokens (estimated).
 * Deterministic: same inputs always produce the same packet.
 */
export function buildSessionMapPacket(
  session: NormalizedSession,
  evidence: ReadonlyArray<EvidenceItem>,
  budget: number,
  registry?: PromptRegistry,
): SessionMapPacket {
  const resolved = resolveTemplate(
    registry,
    SESSION_MAP_PROMPT_ID,
    FALLBACK_SESSION_MAP_SYSTEM,
    OUTPUT_CONTRACT_SESSION_MAP,
  );

  const fixedOverhead =
    estimateTokens(resolved.systemPrompt) +
    estimateTokens(renderTaxonomy()) +
    estimateTokens(JSON.stringify(OUTPUT_CONTRACT_SESSION_MAP)) +
    estimateTokens(renderSessionHeader(session));

  const evidenceBudget = Math.max(0, budget - fixedOverhead);

  const selected = selectEvidenceForBudget([...evidence], evidenceBudget, {
    preferDirectUser: true,
    maxItems: 200,
  });

  const userPayload = renderSessionMapPayload(
    session,
    selected,
    OUTPUT_CONTRACT_SESSION_MAP,
  );

  const tokenEstimate =
    estimateTokens(resolved.systemPrompt) +
    estimateTokens(userPayload);

  return {
    promptID: SESSION_MAP_PROMPT_ID,
    promptVersion: resolved.version,
    systemPrompt: resolved.systemPrompt,
    userPayload,
    outputSchema: resolved.outputSchema,
    includedEvidenceIDs: selected.map((e) => e.evidenceID),
    metadata: {
      sessionID: session.id,
      evidenceCount: selected.length,
      tokenEstimate,
      budget,
    },
  };
}

// ---------------------------------------------------------------------------
// Category reduce packet builder
// ---------------------------------------------------------------------------

/**
 * Build a prompt packet for the **reduce** stage: per-category claim synthesis.
 *
 * Given evidence items filtered to a specific dimension, assembles a compact
 * LLM input payload for cross-session synthesis. Includes:
 * - Focused taxonomy for the target dimension
 * - Primary evidence for this dimension (budget-bounded)
 * - Counter-evidence from other dimensions (20% of remaining budget)
 * - Source claims from prior map stage (if provided)
 * - Output JSON contract
 */
export function buildCategoryReducePacket(
  evidence: ReadonlyArray<EvidenceItem>,
  dimension: WorkflowSignalKind,
  budget: number,
  sourceClaims?: Array<CandidateClaim>,
  registry?: PromptRegistry,
): CategoryReducePacket {
  const resolved = resolveTemplate(
    registry,
    CATEGORY_REDUCE_PROMPT_ID,
    FALLBACK_CATEGORY_REDUCE_SYSTEM,
    OUTPUT_CONTRACT_CATEGORY_REDUCE,
  );

  const dimTaxonomy = TAXONOMY.find((t) => t.kind === dimension);
  const dimLabels = dimTaxonomy?.labels ?? [];
  const dimDescription = dimTaxonomy?.description ?? dimension;

  // Partition evidence: items tagged with this dimension vs counter-evidence.
  const dimSet = new Set<WorkflowSignalKind>([dimension]);
  const primaryEvidence = evidence.filter((item) =>
    item.dimensions.some((d) => dimSet.has(d)),
  );
  const counterEvidence = evidence.filter(
    (item) => !item.dimensions.some((d) => dimSet.has(d)),
  );

  const taxonomySection = `### ${dimension}\nLabels: ${dimLabels.join(", ")}\n${dimDescription}`;
  const claimsSection = renderSourceClaimsSection(sourceClaims ?? []);
  const fixedOverhead =
    estimateTokens(resolved.systemPrompt) +
    estimateTokens(taxonomySection) +
    estimateTokens(JSON.stringify(OUTPUT_CONTRACT_CATEGORY_REDUCE)) +
    estimateTokens(claimsSection);

  // Allocate 80% of remaining budget to primary evidence, 20% to counter
  const remaining = Math.max(0, budget - fixedOverhead);
  const primaryBudget = Math.floor(remaining * 0.8);
  const counterBudget = remaining - primaryBudget;

  const selectedPrimary = selectEvidenceForBudget(
    [...primaryEvidence],
    primaryBudget,
    { preferDirectUser: true, maxItems: 200 },
  );

  const selectedCounter = selectEvidenceForBudget(
    [...counterEvidence],
    counterBudget,
    { preferDirectUser: true, maxItems: 30 },
  );

  const allSelected = [...selectedPrimary, ...selectedCounter];

  const sessionIDs = uniqueSorted(
    allSelected.map((item) => item.citation.sessionID),
  );

  const userPayload = renderCategoryReducePayload(
    dimension,
    dimLabels,
    dimDescription,
    selectedPrimary,
    selectedCounter,
    sourceClaims ?? [],
    OUTPUT_CONTRACT_CATEGORY_REDUCE,
  );

  const tokenEstimate =
    estimateTokens(resolved.systemPrompt) +
    estimateTokens(userPayload);

  return {
    promptID: CATEGORY_REDUCE_PROMPT_ID,
    promptVersion: resolved.version,
    systemPrompt: resolved.systemPrompt,
    userPayload,
    outputSchema: resolved.outputSchema,
    includedEvidenceIDs: allSelected.map((e) => e.evidenceID),
    metadata: {
      dimension,
      sessionIDs,
      evidenceCount: allSelected.length,
      tokenEstimate,
      budget,
    },
  };
}

// ---------------------------------------------------------------------------
// Batch builders
// ---------------------------------------------------------------------------

/**
 * Build all session-map packets for a batch of sessions.
 * Returns packets in deterministic order (sorted by session ID).
 */
export function buildAllSessionMapPackets(
  sessions: Array<NormalizedSession>,
  evidence: Array<EvidenceItem>,
  budgetPerSession: number,
  registry?: PromptRegistry,
): Array<SessionMapPacket> {
  const sorted = stableSort(sessions, (a, b) => a.id.localeCompare(b.id));
  return sorted.map((session) =>
    buildSessionMapPacket(session, evidence, budgetPerSession, registry),
  );
}

/**
 * Build all category-reduce packets for the four taxonomy dimensions.
 * Returns packets in deterministic order (alphabetical by dimension).
 */
export function buildAllCategoryReducePackets(
  evidence: Array<EvidenceItem>,
  budgetPerCategory: number,
  sourceClaims?: Array<CandidateClaim>,
  registry?: PromptRegistry,
): Array<CategoryReducePacket> {
  const dimensions: Array<WorkflowSignalKind> = [
    "communication-style",
    "constraint",
    "validation-habit",
    "work-style",
  ];
  return dimensions.map((dimension) => {
    const dimClaims = sourceClaims?.filter((c) => c.dimension === dimension) ?? [];
    return buildCategoryReducePacket(evidence, dimension, budgetPerCategory, dimClaims, registry);
  });
}

/**
 * Sum estimated tokens across an array of packets.
 * Useful for verifying batch totals stay within rate limits.
 */
export function estimateTotalBatchTokens(
  packets: Array<SessionMapPacket | CategoryReducePacket>,
): number {
  return packets.reduce((sum, p) => sum + p.metadata.tokenEstimate, 0);
}

// ---------------------------------------------------------------------------
// Payload renderers
// ---------------------------------------------------------------------------

function renderSessionHeader(session: NormalizedSession): string {
  const parts = [`# Session: ${session.id}`, `Title: ${session.title}`];
  if (session.summaryText) {
    parts.push(`Summary: ${session.summaryText}`);
  }
  if (session.diffSummary) {
    const d = session.diffSummary;
    parts.push(
      `Diff: ${d.filesChanged} files, +${d.additions}/-${d.deletions}`,
    );
  }
  parts.push(`Messages: ${session.messages.length}`);
  parts.push(`Tool invocations: ${session.toolInvocations.length}`);
  return parts.join("\n");
}

function renderSessionMapPayload(
  session: NormalizedSession,
  evidence: ReadonlyArray<EvidenceItem>,
  outputContract: Record<string, unknown>,
): string {
  const sections: Array<string> = [];

  sections.push(renderSessionHeader(session));
  sections.push("");
  sections.push("## Taxonomy");
  sections.push(renderTaxonomy());
  sections.push("");
  sections.push(`## Evidence (${evidence.length} items)`);
  sections.push(renderEvidenceLines(evidence));
  sections.push("");
  sections.push("## Output Contract");
  sections.push("Respond with valid JSON matching this schema:");
  sections.push("```json");
  sections.push(JSON.stringify(outputContract, null, 2));
  sections.push("```");
  sections.push("");
  sections.push(
    "Instructions:\n" +
      "- Classify each observation into exactly one taxonomy dimension.\n" +
      "- Use labels from the taxonomy above.\n" +
      "- Cite evidenceIDs from the evidence section.\n" +
      "- Include counterEvidenceIDs for observations that have opposing signals.\n" +
      "- Assign confidence 0-1 based on evidence strength.\n" +
      "- Omit dimensions with no supporting evidence.",
  );

  return sections.join("\n");
}

function renderCategoryReducePayload(
  dimension: WorkflowSignalKind,
  labels: ReadonlyArray<string>,
  description: string,
  primaryEvidence: ReadonlyArray<EvidenceItem>,
  counterEvidence: ReadonlyArray<EvidenceItem>,
  sourceClaims: Array<CandidateClaim>,
  outputContract: Record<string, unknown>,
): string {
  const sections: Array<string> = [];

  sections.push(`# Category: ${dimension}`);
  sections.push(`Labels: ${labels.join(", ")}`);
  sections.push(description);
  sections.push("");

  // Source claims from map stage (compact reference)
  sections.push(renderSourceClaimsSection(sourceClaims));
  sections.push("");

  sections.push(
    `## Supporting Evidence (${primaryEvidence.length} items)`,
  );
  sections.push(renderEvidenceLines(primaryEvidence));
  sections.push("");

  if (counterEvidence.length > 0) {
    sections.push(
      `## Counter-Evidence (${counterEvidence.length} items)`,
    );
    sections.push(
      "The following observations may contradict or nuance the claims above:",
    );
    sections.push(renderEvidenceLines(counterEvidence));
    sections.push("");
  }

  sections.push("## Output Contract");
  sections.push("Respond with valid JSON matching this schema:");
  sections.push("```json");
  sections.push(JSON.stringify(outputContract, null, 2));
  sections.push("```");
  sections.push("");
  sections.push(
    "Instructions:\n" +
      `- Synthesize claims ONLY for dimension "${dimension}".\n` +
      "- Use labels from the taxonomy above.\n" +
      "- Cite evidenceIDs from both supporting and counter sections.\n" +
      "- Merge overlapping observations into consolidated claims.\n" +
      "- Assign confidence 0-1 based on convergence across sessions.\n" +
      "- Include counterEvidenceIDs where applicable.",
  );

  return sections.join("\n");
}

function renderSourceClaimsSection(claims: Array<CandidateClaim>): string {
  if (claims.length === 0) {
    return "## Source Claims\n[No prior claims — perform extraction from evidence only]";
  }
  const header = `## Source Claims (${claims.length} from map stage)`;
  const sorted = stableSort(claims, (a, b) => a.claimID.localeCompare(b.claimID));
  const lines = sorted.map((claim) => {
    const citationIDs = claim.citations.map((c) => c.evidenceID).join(", ");
    const src = claim.source;
    const srcLabel = src.type === "llm-session" ? `session:${src.sessionID}`
      : src.type === "rule" ? `rule:${src.ruleID}`
      : src.type === "llm-category" ? `category:${src.dimension}`
      : "unknown";
    return `- [${claim.claimID}] (${srcLabel}) ${claim.dimension}/${String(claim.label)} confidence=${claim.confidence.toFixed(2)} | citations: ${citationIDs}`;
  });
  return [header, ...lines].join("\n");
}
