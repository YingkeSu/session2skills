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

export const allPrompts = [
  enrichProfilePrompt,
  generateSkillPrompt,
  classifySignalPrompt,
] as const;
