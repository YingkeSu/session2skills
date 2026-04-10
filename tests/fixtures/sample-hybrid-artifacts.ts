import type { RankedMergedClaim } from "../../src/analyze/claim-merge.js";

export const sampleAcceptedMergedClaims: Array<RankedMergedClaim> = [
  {
    schemaVersion: "merged-claim/v1",
    claimID: "merged:work-style:analysis-first",
    dimension: "work-style",
    label: "analysis-first",
    confidence: 0.884,
    rationale:
      "2 supporting claim(s) (1 rule, 1 llm) with 2 evidence citation(s) across 2 session(s). Rule and LLM agreement increased confidence. No contradictory label pair was detected.",
    citations: [
      {
        evidenceID: "ev:work:1",
        sessionID: "ses_alpha",
        messageID: "msg_1",
        sourceType: "message",
        excerpt: "Please inspect the repository before making changes.",
      },
      {
        evidenceID: "ev:work:2",
        sessionID: "ses_beta",
        sourceType: "tool",
        excerpt: "read src/index.ts before patching",
      },
    ],
    sources: [
      {
        claimID: "claim:llm:analysis-first",
        dimension: "work-style",
        label: "analysis-first",
        confidence: 0.86,
        source: {
          type: "llm-session",
          traceID: "trace:work:1",
          promptSetVersion: "prompt-set/v1",
          sessionID: "ses_alpha",
        },
      },
      {
        claimID: "claim:rule:analysis-first",
        dimension: "work-style",
        label: "analysis-first",
        confidence: 0.9,
        source: {
          type: "rule",
          ruleID: "extract-work-style/analysis-first",
        },
      },
    ],
    status: "accepted",
    normalizedLabel: "analysis-first",
    evidenceCount: 2,
    sessionIDs: ["ses_alpha", "ses_beta"],
    sourceClaimIDs: ["claim:llm:analysis-first", "claim:rule:analysis-first"],
    sourceTypes: ["llm-session", "rule"],
    agreementBonus: 0.12,
    sessionCoverageBonus: 0.04,
    contradictionPenalty: 0,
    contradictions: [],
  },
  {
    schemaVersion: "merged-claim/v1",
    claimID: "merged:validation-habit:run-diagnostics",
    dimension: "validation-habit",
    label: "run-diagnostics",
    confidence: 0.79,
    rationale:
      "1 supporting claim(s) (1 rule, 0 llm) with 2 evidence citation(s) across 1 session(s). No cross-source agreement bonus applied. No contradictory label pair was detected.",
    citations: [
      {
        evidenceID: "ev:validation:1",
        sessionID: "ses_alpha",
        sourceType: "tool",
        excerpt: "Ran lsp_diagnostics after editing the parser",
      },
      {
        evidenceID: "ev:validation:2",
        sessionID: "ses_alpha",
        sourceType: "tool",
        excerpt: "npm run test completed successfully",
      },
    ],
    sources: [
      {
        claimID: "claim:rule:run-diagnostics",
        dimension: "validation-habit",
        label: "run-diagnostics",
        confidence: 0.79,
        source: {
          type: "rule",
          ruleID: "extract-validation-habits/run-diagnostics",
        },
      },
    ],
    status: "accepted",
    normalizedLabel: "run-diagnostics",
    evidenceCount: 2,
    sessionIDs: ["ses_alpha"],
    sourceClaimIDs: ["claim:rule:run-diagnostics"],
    sourceTypes: ["rule"],
    agreementBonus: 0,
    sessionCoverageBonus: 0,
    contradictionPenalty: 0,
    contradictions: [],
  },
  {
    schemaVersion: "merged-claim/v1",
    claimID: "merged:constraint:minimal-diff",
    dimension: "constraint",
    label: "minimal-diff",
    confidence: 0.73,
    rationale:
      "1 supporting claim(s) (1 rule, 0 llm) with 1 evidence citation(s) across 1 session(s). No cross-source agreement bonus applied. No contradictory label pair was detected.",
    citations: [
      {
        evidenceID: "ev:constraint:1",
        sessionID: "ses_beta",
        messageID: "msg_9",
        sourceType: "message",
        excerpt: "Please keep the diff small and focused.",
      },
    ],
    sources: [
      {
        claimID: "claim:rule:minimal-diff",
        dimension: "constraint",
        label: "minimal-diff",
        confidence: 0.73,
        source: {
          type: "rule",
          ruleID: "extract-constraints/minimal-diff",
        },
      },
    ],
    status: "accepted",
    normalizedLabel: "minimal-diff",
    evidenceCount: 1,
    sessionIDs: ["ses_beta"],
    sourceClaimIDs: ["claim:rule:minimal-diff"],
    sourceTypes: ["rule"],
    agreementBonus: 0,
    sessionCoverageBonus: 0,
    contradictionPenalty: 0,
    contradictions: [],
  },
];

export const sampleTentativeMergedClaims: Array<RankedMergedClaim> = [
  {
    schemaVersion: "merged-claim/v1",
    claimID: "merged:communication-style:concise",
    dimension: "communication-style",
    label: "concise",
    confidence: 0.48,
    rationale:
      "1 supporting claim(s) (0 rule, 1 llm) with 1 evidence citation(s) across 1 session(s). No cross-source agreement bonus applied. Contradictions surfaced with explanatory, so confidence was reduced.",
    citations: [
      {
        evidenceID: "ev:comm:1",
        sessionID: "ses_gamma",
        messageID: "msg_2",
        sourceType: "message",
        excerpt: "Keep the reply short.",
      },
    ],
    sources: [
      {
        claimID: "claim:llm:concise",
        dimension: "communication-style",
        label: "concise",
        confidence: 0.48,
        source: {
          type: "llm-category",
          traceID: "trace:comm:1",
          promptSetVersion: "prompt-set/v1",
          dimension: "communication-style",
        },
      },
    ],
    status: "tentative",
    normalizedLabel: "concise",
    evidenceCount: 1,
    sessionIDs: ["ses_gamma"],
    sourceClaimIDs: ["claim:llm:concise"],
    sourceTypes: ["llm-category"],
    agreementBonus: 0,
    sessionCoverageBonus: 0,
    contradictionPenalty: 0.18,
    contradictions: [
      {
        withClaimID: "merged:communication-style:explanatory",
        withLabel: "explanatory",
        normalizedLabel: "explanatory",
        penalty: 0.18,
      },
    ],
  },
];

export const sampleHybridMergedClaims = [
  ...sampleAcceptedMergedClaims,
  ...sampleTentativeMergedClaims,
];
