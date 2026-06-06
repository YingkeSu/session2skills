import type { PreferenceProfile, WorkflowSignal } from "../../normalize/models.js";
import type { PromptTemplate } from "./registry.js";

/**
 * Prompt: enrich-profile
 *
 * Takes a heuristically-built PreferenceProfile and asks the LLM
 * to refine, merge, or expand the signals based on the raw session
 * data. Output shape mirrors the existing PreferenceProfile but
 * allows the LLM to adjust weights and add evidence.
 */
export const enrichProfilePrompt: PromptTemplate<{
  profile: PreferenceProfile;
  confidenceNotes: Array<string>;
}> = {
  id: "enrich-profile",
  version: "1.0.0",
  description:
    "Refine a heuristically-built preference profile by merging LLM observations with extracted signals.",
  systemPrompt: [
    "You are a developer behavior analyst.",
    "Given a preference profile built from session heuristics, refine the signals.",
    "Adjust weights based on pattern strength. Add missing signals only if evidence is strong.",
    "Output valid JSON matching the provided schema.",
    "Preserve the taxonomy categories: workStyle, communicationStyle, validationHabits, constraints.",
  ].join("\n"),
  outputSchema: {
    type: "object",
    properties: {
      profile: {
        type: "object",
        properties: {
          workStyle: { type: "array", items: { $ref: "#/$defs/signal" } },
          communicationStyle: { type: "array", items: { $ref: "#/$defs/signal" } },
          validationHabits: { type: "array", items: { $ref: "#/$defs/signal" } },
          constraints: { type: "array", items: { $ref: "#/$defs/signal" } },
          confidenceNotes: { type: "array", items: { type: "string" } },
        },
        required: ["workStyle", "communicationStyle", "validationHabits", "constraints", "confidenceNotes"],
      },
      confidenceNotes: { type: "array", items: { type: "string" } },
    },
    required: ["profile", "confidenceNotes"],
    $defs: {
      signal: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["work-style", "communication-style", "validation-habit", "constraint"] },
          value: { type: "string" },
          weight: { type: "number", minimum: 0 },
          evidence: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sessionID: { type: "string" },
                messageID: { type: "string" },
                excerpt: { type: "string" },
              },
            },
          },
        },
        required: ["kind", "value", "weight", "evidence"],
      },
    },
  },
  outputTypeHint: "{ profile: PreferenceProfile; confidenceNotes: string[] }",
};

/**
 * Prompt: generate-skill
 *
 * Takes a refined PreferenceProfile and produces a SKILL.md
 * document that captures the user's workflow preferences.
 */
export const generateSkillPrompt: PromptTemplate<{ skillMarkdown: string }> = {
  id: "generate-skill",
  version: "1.0.0",
  description: "Generate a SKILL.md document from a refined preference profile.",
  systemPrompt: [
    "You are writing a personalized workflow skill document for an AI coding assistant.",
    "Given a preference profile, produce a concise SKILL.md that captures the user's habits.",
    "Use direct, imperative language. Avoid hedging.",
    "Output valid JSON with a single 'skillMarkdown' field containing the full markdown.",
  ].join("\n"),
  outputSchema: {
    type: "object",
    properties: {
      skillMarkdown: { type: "string" },
    },
    required: ["skillMarkdown"],
  },
  outputTypeHint: "{ skillMarkdown: string }",
};

/**
 * Prompt: classify-signal
 *
 * Classifies a raw observation into the existing taxonomy
 * (work-style, communication-style, validation-habit, constraint).
 */
export const classifySignalPrompt: PromptTemplate<WorkflowSignal> = {
  id: "classify-signal",
  version: "1.0.0",
  description: "Classify a raw session observation into the preference taxonomy.",
  systemPrompt: [
    "You are classifying developer behavior observations into a taxonomy.",
    "The taxonomy categories are: work-style, communication-style, validation-habit, constraint.",
    "Given a raw observation and its context, assign the best-fitting category.",
    "Assign a weight from 1-5 based on how strongly the observation indicates the signal.",
    "Output valid JSON matching the signal schema.",
  ].join("\n"),
  outputSchema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["work-style", "communication-style", "validation-habit", "constraint"] },
      value: { type: "string" },
      weight: { type: "number", minimum: 1, maximum: 5 },
      evidence: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sessionID: { type: "string" },
            messageID: { type: "string" },
            excerpt: { type: "string" },
          },
        },
      },
    },
    required: ["kind", "value", "weight", "evidence"],
  },
  outputTypeHint: "WorkflowSignal",
};

// ---------------------------------------------------------------------------
// Harness pipeline prompts
// ---------------------------------------------------------------------------

const HARNESS_DIMENSIONS_ENUM = [
  "work-style",
  "communication-style",
  "validation-habit",
  "constraint",
  "token-efficiency",
  "model-selection",
  "delegation-pattern",
];

const HARNESS_LABELS = {
  "work-style": ["analysis-first", "implementation-first", "iterative", "one-shot"],
  "communication-style": ["concise", "explanatory", "consultative", "directive"],
  "validation-habit": ["run-tests", "run-diagnostics", "check-git-state"],
  "constraint": ["minimal-diff", "preserve-patterns", "type-safety", "avoid-destructive-actions"],
  "token-efficiency": ["explorer", "implementer", "analytical", "context-reuser"],
  "model-selection": ["cost-conscious", "quality-focused", "adaptive"],
  "delegation-pattern": ["hands-on", "trusting", "parallelizer"],
};

/**
 * Prompt: harness-analyst
 *
 * Stage 1 of the harness pipeline. Reads ALL session evidence and produces
 * a structured claim manifest — the canonical artifact for all downstream stages.
 */
export const harnessAnalystPrompt: PromptTemplate<unknown> = {
  id: "harness-analyst",
  version: "1.0.0",
  description:
    "Evidence Analyst: reads all session evidence and produces a structured claim manifest.",
  systemPrompt: [
    "You are an Evidence Analyst for developer behavior patterns.",
    "Given session evidence, extract candidate claims about the developer's workflow preferences.",
    "You must cover ALL 7 taxonomy dimensions when evidence supports them.",
    "Each claim must cite specific evidence IDs from the provided data.",
    "Assign confidence 0–1 based on evidence strength and consistency.",
    "Do NOT fabricate evidence. Only cite IDs that appear in the input.",
    "Output valid JSON matching the provided schema.",
  ].join("\n"),
  outputSchema: {
    type: "object",
    properties: {
      claims: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            dimension: { type: "string", enum: HARNESS_DIMENSIONS_ENUM },
            label: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            rationale: { type: "string" },
            evidenceRefs: { type: "array", items: { type: "string" } },
          },
          required: ["id", "dimension", "label", "confidence", "rationale", "evidenceRefs"],
        },
      },
      evidenceSummary: { type: "string" },
      dimensionsCovered: {
        type: "array",
        items: { type: "string", enum: HARNESS_DIMENSIONS_ENUM },
      },
    },
    required: ["claims", "evidenceSummary", "dimensionsCovered"],
  },
  outputTypeHint: "ClaimManifest",
};

/**
 * Prompt: harness-skeptic
 *
 * Stage 2: Reviews the claim manifest and challenges each claim.
 * Finds unsupported, contradicted, overconfident, or vague claims.
 */
export const harnessSkepticPrompt: PromptTemplate<unknown> = {
  id: "harness-skeptic",
  version: "1.0.0",
  description:
    "Skeptic: reviews the claim manifest and challenges unsupported or overconfident claims.",
  systemPrompt: [
    "You are a Skeptic reviewing a claim manifest about developer behavior.",
    "For each claim, verify that:",
    "1. The evidence_refs actually support the claim (not just related)",
    "2. The confidence is appropriate given the evidence count and consistency",
    "3. There are no contradictory claims in the manifest",
    "4. The rationale is specific and grounded in evidence",
    "Assign severity: high (claim should be dropped), medium (confidence adjustment), low (minor issue).",
    "Be critical but fair. Do not invent problems that don't exist.",
    "Output valid JSON matching the provided schema.",
  ].join("\n"),
  outputSchema: {
    type: "object",
    properties: {
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            claimId: { type: "string" },
            severity: { type: "string", enum: ["high", "medium", "low"] },
            problemType: {
              type: "string",
              enum: ["unsupported", "contradicted", "overconfident", "vague", "duplicate"],
            },
            detail: { type: "string" },
            suggestion: { type: "string" },
          },
          required: ["claimId", "severity", "problemType", "detail", "suggestion"],
        },
      },
      overallScore: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["issues", "overallScore"],
  },
  outputTypeHint: "SkepticReport",
};

/**
 * Prompt: harness-writer
 *
 * Stage 3: Renders SKILL.md prose from the claim manifest.
 * MUST only reference manifest claims — cannot add new information.
 */
export const harnessWriterPrompt: PromptTemplate<unknown> = {
  id: "harness-writer",
  version: "1.0.0",
  description:
    "Skill Writer: renders SKILL.md prose from the claim manifest. Must only reference manifest claims.",
  systemPrompt: [
    "You are writing a SKILL.md document for an AI coding assistant.",
    "Given a claim manifest, produce actionable, imperative guidance.",
    "CRITICAL RULES:",
    "- Every directive MUST reference a claim ID from the manifest (sourceClaimId)",
    "- Do NOT add claims, directives, or information not in the manifest",
    "- Do NOT invent preferences the user does not have",
    "- Use direct, imperative language. Avoid hedging.",
    "- Group directives into sections by dimension",
    "- For dimensions with no claims, omit the section entirely",
    "Output valid JSON matching the provided schema.",
  ].join("\n"),
  outputSchema: {
    type: "object",
    properties: {
      skillMarkdown: { type: "string" },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            summary: { type: "string" },
            directives: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  sourceClaimId: { type: "string" },
                },
                required: ["text", "sourceClaimId"],
              },
            },
            groundingClaimIds: { type: "array", items: { type: "string" } },
          },
          required: ["title", "summary", "directives", "groundingClaimIds"],
        },
      },
    },
    required: ["skillMarkdown", "sections"],
  },
  outputTypeHint: "WriterOutput",
};

/**
 * Prompt: harness-verifier
 *
 * Stage 4: Cross-checks SKILL.md output against the claim manifest.
 * Performs mechanical verification — not creative.
 */
export const harnessVerifierPrompt: PromptTemplate<unknown> = {
  id: "harness-verifier",
  version: "1.0.0",
  description:
    "Verifier: cross-checks SKILL.md output against claim manifest for accuracy and completeness.",
  systemPrompt: [
    "You are a Verifier performing mechanical cross-checks on a SKILL.md document.",
    "Given the SKILL.md and its source claim manifest, verify:",
    "1. Every directive in SKILL.md maps to a valid claim in the manifest",
    "2. No directives exist that don't correspond to a manifest claim (fabrication)",
    "3. No high-confidence claims are completely missing from SKILL.md (omission)",
    "4. Each section's grounding claim IDs are valid manifest claim IDs",
    "For each directive, mark status as: verified (maps to valid claim), unreferenced (no claim found), or fabricated (contradicts evidence).",
    "Set pass=true ONLY if there are no fabricated directives.",
    "Output valid JSON matching the provided schema.",
  ].join("\n"),
  outputSchema: {
    type: "object",
    properties: {
      pass: { type: "boolean" },
      checkedItems: {
        type: "array",
        items: {
          type: "object",
          properties: {
            directive: { type: "string" },
            claimId: { type: "string" },
            status: { type: "string", enum: ["verified", "unreferenced", "fabricated"] },
          },
          required: ["directive", "claimId", "status"],
        },
      },
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            location: { type: "string" },
            severity: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["description", "location", "severity"],
        },
      },
    },
    required: ["pass", "checkedItems", "issues"],
  },
  outputTypeHint: "VerifierReport",
};

export const allPrompts = [
  enrichProfilePrompt,
  generateSkillPrompt,
  classifySignalPrompt,
  harnessAnalystPrompt,
  harnessSkepticPrompt,
  harnessWriterPrompt,
  harnessVerifierPrompt,
] as const;
