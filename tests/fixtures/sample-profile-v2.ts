import type { ProfileV2 } from "../../src/normalize/models.js";

export const sampleProfileV2: ProfileV2 = {
  schemaVersion: "profile/v2",
  promptSetVersion: "prompt-set/v1",
  workStyle: [
    {
      kind: "work-style",
      value: "analysis-first",
      weight: 9,
      evidence: [{ sessionID: "ses_abc", sourceType: "message", excerpt: "Let me explore the repository structure first" }],
    },
  ],
  communicationStyle: [
    {
      kind: "communication-style",
      value: "concise",
      weight: 4,
      evidence: [{ sessionID: "ses_abc", sourceType: "message", excerpt: "Keep it short" }],
    },
  ],
  validationHabits: [
    {
      kind: "validation-habit",
      value: "run-diagnostics",
      weight: 8,
      evidence: [{ sessionID: "ses_abc", sourceType: "tool", excerpt: "Ran lsp_diagnostics after edit" }],
    },
  ],
  constraints: [
    {
      kind: "constraint",
      value: "type-safety",
      weight: 7,
      evidence: [{ sessionID: "ses_abc", sourceType: "message", excerpt: "Always pass typecheck before committing" }],
    },
  ],
  strongestSignals: {
    "work-style": [],
    "communication-style": [],
    "validation-habit": [],
    constraint: [],
  },
  acceptedClaims: [],
  tentativeClaims: [],
  unresolvedAreas: [
    "communication style: strongest claim `concise` is still tentative (0.41)",
  ],
  confidenceNotes: [
    "Work style derived from 2 sessions with cross-source agreement.",
    "Validation habits have limited evidence (1 session).",
  ],
  mergedClaims: [
    {
      schemaVersion: "merged-claim/v1",
      claimID: "merged:work-style:analysis-first",
      dimension: "work-style",
      label: "analysis-first",
      confidence: 0.856,
      rationale:
        "2 supporting claim(s) (1 rule, 1 llm) with 3 evidence citation(s) across 2 session(s). Rule and LLM agreement increased confidence. No contradictory label pair was detected.",
      citations: [
        {
          evidenceID: "ev-001",
          sessionID: "ses_abc",
          messageID: "msg_001",
          sourceType: "message",
          excerpt: "Let me explore the repository structure first",
        },
        {
          evidenceID: "ev-002",
          sessionID: "ses_abc",
          messageID: "msg_005",
          sourceType: "tool",
          excerpt: "Read directory structure before implementing",
        },
        {
          evidenceID: "ev-003",
          sessionID: "ses_def",
          sourceType: "summary",
          excerpt: "User prefers understanding codebase before changes",
        },
      ],
      sources: [
        {
          claimID: "rule:001",
          dimension: "work-style",
          label: "analysis-first",
          confidence: 0.9,
          source: { type: "rule", ruleID: "work-style-heuristic" },
        },
        {
          claimID: "llm:ses_abc:001",
          dimension: "work-style",
          label: "analysis-first",
          confidence: 0.82,
          source: {
            type: "llm-session",
            traceID: "trace-001",
            promptSetVersion: "prompt-set/v1",
            sessionID: "ses_abc",
          },
        },
      ],
    },
    {
      schemaVersion: "merged-claim/v1",
      claimID: "merged:communication-style:concise",
      dimension: "communication-style",
      label: "concise",
      confidence: 0.412,
      rationale:
        "1 supporting claim(s) (0 rule, 1 llm) with 1 evidence citation(s) across 1 session(s). No cross-source agreement bonus applied. Contradictions surfaced with explanatory, so confidence was reduced.",
      citations: [
        {
          evidenceID: "ev-010",
          sessionID: "ses_abc",
          messageID: "msg_003",
          sourceType: "message",
          excerpt: "Keep it short",
        },
      ],
      sources: [
        {
          claimID: "llm:ses_abc:005",
          dimension: "communication-style",
          label: "concise",
          confidence: 0.55,
          source: {
            type: "llm-session",
            traceID: "trace-001",
            promptSetVersion: "prompt-set/v1",
            sessionID: "ses_abc",
          },
        },
      ],
    },
    {
      schemaVersion: "merged-claim/v1",
      claimID: "merged:validation-habit:run-diagnostics",
      dimension: "validation-habit",
      label: "run-diagnostics",
      confidence: 0.78,
      rationale:
        "1 supporting claim(s) (1 rule, 0 llm) with 2 evidence citation(s) across 1 session(s). No cross-source agreement bonus applied. No contradictory label pair was detected.",
      citations: [
        {
          evidenceID: "ev-020",
          sessionID: "ses_abc",
          messageID: "msg_007",
          sourceType: "tool",
          excerpt: "Ran lsp_diagnostics after edit",
        },
      ],
      sources: [
        {
          claimID: "rule:002",
          dimension: "validation-habit",
          label: "run-diagnostics",
          confidence: 0.78,
          source: { type: "rule", ruleID: "diagnostics-heuristic" },
        },
      ],
    },
    {
      schemaVersion: "merged-claim/v1",
      claimID: "merged:constraint:type-safety",
      dimension: "constraint",
      label: "type-safety",
      confidence: 0.72,
      rationale:
        "1 supporting claim(s) (1 rule, 0 llm) with 1 evidence citation(s) across 1 session(s). No cross-source agreement bonus applied. No contradictory label pair was detected.",
      citations: [
        {
          evidenceID: "ev-030",
          sessionID: "ses_abc",
          messageID: "msg_009",
          sourceType: "message",
          excerpt: "Always pass typecheck before committing",
        },
      ],
      sources: [
        {
          claimID: "rule:003",
          dimension: "constraint",
          label: "type-safety",
          confidence: 0.72,
          source: { type: "rule", ruleID: "typecheck-heuristic" },
        },
      ],
    },
  ],
};

sampleProfileV2.strongestSignals["work-style"] = [sampleProfileV2.mergedClaims[0]!];
sampleProfileV2.strongestSignals["communication-style"] = [sampleProfileV2.mergedClaims[1]!];
sampleProfileV2.strongestSignals["validation-habit"] = [sampleProfileV2.mergedClaims[2]!];
sampleProfileV2.strongestSignals.constraint = [sampleProfileV2.mergedClaims[3]!];

sampleProfileV2.acceptedClaims = [
  {
    schemaVersion: "candidate-claim/v1",
    claimID: "merged:work-style:analysis-first",
    dimension: "work-style",
    label: "analysis-first",
    confidence: 0.856,
    rationale: sampleProfileV2.mergedClaims[0]!.rationale,
    citations: sampleProfileV2.mergedClaims[0]!.citations,
    source: { type: "rule", ruleID: "work-style-heuristic" },
  },
  {
    schemaVersion: "candidate-claim/v1",
    claimID: "merged:validation-habit:run-diagnostics",
    dimension: "validation-habit",
    label: "run-diagnostics",
    confidence: 0.78,
    rationale: sampleProfileV2.mergedClaims[2]!.rationale,
    citations: sampleProfileV2.mergedClaims[2]!.citations,
    source: { type: "rule", ruleID: "diagnostics-heuristic" },
  },
  {
    schemaVersion: "candidate-claim/v1",
    claimID: "merged:constraint:type-safety",
    dimension: "constraint",
    label: "type-safety",
    confidence: 0.72,
    rationale: sampleProfileV2.mergedClaims[3]!.rationale,
    citations: sampleProfileV2.mergedClaims[3]!.citations,
    source: { type: "rule", ruleID: "typecheck-heuristic" },
  },
];

sampleProfileV2.tentativeClaims = [
  {
    schemaVersion: "candidate-claim/v1",
    claimID: "merged:communication-style:concise",
    dimension: "communication-style",
    label: "concise",
    confidence: 0.412,
    rationale: sampleProfileV2.mergedClaims[1]!.rationale,
    citations: sampleProfileV2.mergedClaims[1]!.citations,
    source: {
      type: "llm-session",
      traceID: "trace-001",
      promptSetVersion: "prompt-set/v1",
      sessionID: "ses_abc",
    },
  },
];
