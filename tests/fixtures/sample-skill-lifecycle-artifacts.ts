import type {
  EvolutionCandidate,
  SkillEvaluation,
  SkillIntent,
  SkillPatch,
} from "../../src/normalize/models.js";

export const sampleSkillIntent = {
  schemaVersion: "skill-intent/v1",
  name: "typescript-cli-maintenance",
  trigger: "Use when modifying a TypeScript CLI that already has established command, persistence, and test patterns.",
  targetAgent: "generic",
  problemClass: "Maintain or extend an existing TypeScript CLI without disrupting established behavior.",
  workflow: [
    "Inspect the command entry point and the target module before editing.",
    "Make the smallest cohesive change that satisfies the request.",
    "Keep generated artifacts separate from source changes.",
  ],
  constraints: [
    "Preserve ESM import extensions.",
    "Avoid new runtime dependencies unless the existing design requires one.",
  ],
  validation: [
    "Run typecheck after changing shared contracts.",
    "Run focused tests for changed behavior.",
  ],
  antiPatterns: [
    "Do not rewrite unrelated command flows.",
    "Do not leave debug artifact language in generated skills.",
  ],
  evidenceClaimIDs: [
    "merged-workstyle-analysis-first",
    "merged-constraint-preserve-patterns",
  ],
  confidence: "high",
} satisfies SkillIntent;

export const sampleSkillPatch = {
  schemaVersion: "skill-patch/v1",
  targetSection: "Validation",
  reason: "The validation guidance should name the project's typecheck command explicitly.",
  find: "Run the most relevant verification step before claiming completion.",
  replace: "Run `npm run typecheck` after shared TypeScript contract changes before claiming completion.",
  claimIDs: ["merged-validation-run-diagnostics"],
  risk: "low",
} satisfies SkillPatch;

export const sampleSkillEvaluation = {
  schemaVersion: "skill-evaluation/v1",
  skillID: "typescript-cli-maintenance",
  evaluatedAt: "2026-06-11T00:00:00.000Z",
  gates: {
    lint: "pass",
    redaction: "pass",
    grounding: "pass",
    semanticPreservation: "pass",
  },
  scores: {
    grounding: 0.92,
    actionability: 0.86,
    specificity: 0.83,
    safety: 0.94,
    concision: 0.78,
    discoverability: 0.81,
    duplication: 0.1,
  },
  verdict: "pass",
  issues: [],
} satisfies SkillEvaluation;

export const sampleEvolutionCandidate = {
  schemaVersion: "evolution-candidate/v1",
  candidateID: "candidate:typescript-cli-maintenance:validation-specificity",
  baseSkillID: "typescript-cli-maintenance",
  patch: sampleSkillPatch,
  rationale: "Make the validation directive more concrete while preserving the original intent.",
  expectedImprovement: "Higher actionability and specificity without adding risk.",
  evaluation: sampleSkillEvaluation,
} satisfies EvolutionCandidate;
