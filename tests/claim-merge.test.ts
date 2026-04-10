import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { mergeClaims } from "../src/analyze/claim-merge.js";
import type { CandidateClaim, EvidenceItem } from "../src/normalize/models.js";

function makeEvidence(
  overrides: Partial<EvidenceItem> & { citation?: Partial<EvidenceItem["citation"]> } = {},
): EvidenceItem {
  const evidenceID = overrides.evidenceID ?? "ev:1";

  return {
    schemaVersion: "evidence-item/v1",
    evidenceID,
    citation: {
      evidenceID,
      sessionID: overrides.citation?.sessionID ?? "ses_1",
      messageID: overrides.citation?.messageID,
      partID: overrides.citation?.partID,
      sourceType: overrides.citation?.sourceType ?? "message",
      excerpt: overrides.citation?.excerpt ?? "Sample evidence",
    },
    summaryText: overrides.summaryText ?? "Sample evidence",
    dimensions: overrides.dimensions ?? ["constraint"],
  };
}

function makeConstraintClaim(
  claimID: string,
  source: CandidateClaim<"constraint">["source"],
  overrides: Partial<CandidateClaim<"constraint">> = {},
): CandidateClaim<"constraint"> {
  return {
    schemaVersion: "candidate-claim/v1",
    claimID,
    dimension: "constraint",
    label: "minimal-diff",
    confidence: 0.75,
    rationale: "User prefers smaller changes",
    citations: [
      {
        evidenceID: "ev:1",
        sessionID: "ses_1",
        sourceType: "message",
      },
      {
        evidenceID: "ev:2",
        sessionID: "ses_2",
        sourceType: "message",
      },
    ],
    source,
    ...overrides,
  };
}

function makeWorkStyleClaim(
  claimID: string,
  label: CandidateClaim<"work-style">["label"],
  evidenceID: string,
): CandidateClaim<"work-style"> {
  return {
    schemaVersion: "candidate-claim/v1",
    claimID,
    dimension: "work-style",
    label,
    confidence: 0.8,
    rationale: `Detected ${label}`,
    citations: [
      {
        evidenceID,
        sessionID: evidenceID === "ev:3" ? "ses_3" : "ses_4",
        sourceType: "message",
      },
    ],
    source: { type: "rule", ruleID: `extract-work-style/${label}` },
  };
}

describe("mergeClaims", () => {
  it("applies agreement bonus when rule and llm claims converge", () => {
    const evidence = [
      makeEvidence({ evidenceID: "ev:1", citation: { evidenceID: "ev:1", sessionID: "ses_1", sourceType: "message" }, dimensions: ["constraint"] }),
      makeEvidence({ evidenceID: "ev:2", citation: { evidenceID: "ev:2", sessionID: "ses_2", sourceType: "message" }, dimensions: ["constraint"] }),
    ];

    const ruleOnly = mergeClaims(
      [makeConstraintClaim("claim:rule:1", { type: "rule", ruleID: "extract-constraints/minimal-diff" })],
      [],
      evidence,
    );

    const withAgreement = mergeClaims(
      [makeConstraintClaim("claim:rule:1", { type: "rule", ruleID: "extract-constraints/minimal-diff" })],
      [
        makeConstraintClaim("claim:llm:1", {
          type: "llm-session",
          traceID: "trace_1",
          promptSetVersion: "prompt-set/v1",
          sessionID: "ses_2",
        }, { label: "Minimal Diff" as CandidateClaim<"constraint">["label"], confidence: 0.78 }),
      ],
      evidence,
    );

    expect(ruleOnly.accepted).toHaveLength(0);
    expect(withAgreement.accepted).toHaveLength(1);
    expect(withAgreement.accepted[0]!.confidence).toBeGreaterThan(ruleOnly.tentative[0]!.confidence);
    expect(withAgreement.accepted[0]!.agreementBonus).toBeGreaterThan(0);
  });

  it("rejects invalid evidence citations instead of merging them", () => {
    const evidence = [makeEvidence({ evidenceID: "ev:1" })];

    const result = mergeClaims(
      [],
      [
        makeConstraintClaim(
          "claim:llm:bad",
          {
            type: "llm-session",
            traceID: "trace_bad",
            promptSetVersion: "prompt-set/v1",
            sessionID: "ses_1",
          },
          {
            citations: [
              {
                evidenceID: "ev:missing",
                sessionID: "ses_1",
                sourceType: "message",
              },
            ],
          },
        ),
      ],
      evidence,
    );

    expect(result.accepted).toHaveLength(0);
    expect(result.tentative).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.reasons.join(" ")).toContain("unknown evidenceID");
  });

  it("surfaces contradictory claims as tentative", () => {
    const evidence = [
      makeEvidence({ evidenceID: "ev:3", citation: { evidenceID: "ev:3", sessionID: "ses_3", sourceType: "message" }, dimensions: ["work-style"] }),
      makeEvidence({ evidenceID: "ev:4", citation: { evidenceID: "ev:4", sessionID: "ses_4", sourceType: "message" }, dimensions: ["work-style"] }),
    ];

    const result = mergeClaims(
      [
        makeWorkStyleClaim("claim:rule:analysis", "analysis-first", "ev:3"),
        makeWorkStyleClaim("claim:rule:implementation", "implementation-first", "ev:4"),
      ],
      [],
      evidence,
    );

    expect(result.accepted).toHaveLength(0);
    expect(result.tentative).toHaveLength(2);
    expect(result.tentative[0]!.contradictions.length).toBeGreaterThan(0);
    expect(result.tentative[1]!.contradictions.length).toBeGreaterThan(0);
  });

  it("increases confidence when citations span multiple sessions", () => {
    const sameSessionEvidence = [
      makeEvidence({ evidenceID: "ev:1", citation: { evidenceID: "ev:1", sessionID: "ses_1", sourceType: "message" }, dimensions: ["constraint"] }),
      makeEvidence({ evidenceID: "ev:2", citation: { evidenceID: "ev:2", sessionID: "ses_1", sourceType: "message" }, dimensions: ["constraint"] }),
    ];
    const crossSessionEvidence = [
      makeEvidence({ evidenceID: "ev:1", citation: { evidenceID: "ev:1", sessionID: "ses_1", sourceType: "message" }, dimensions: ["constraint"] }),
      makeEvidence({ evidenceID: "ev:2", citation: { evidenceID: "ev:2", sessionID: "ses_2", sourceType: "message" }, dimensions: ["constraint"] }),
    ];

    const sameSession = mergeClaims(
      [makeConstraintClaim("claim:rule:1", { type: "rule", ruleID: "extract-constraints/minimal-diff" }, {
        citations: [
          {
            evidenceID: "ev:1",
            sessionID: "ses_1",
            sourceType: "message",
          },
          {
            evidenceID: "ev:2",
            sessionID: "ses_1",
            sourceType: "message",
          },
        ],
      })],
      [],
      sameSessionEvidence,
    );
    const crossSession = mergeClaims(
      [makeConstraintClaim("claim:rule:1", { type: "rule", ruleID: "extract-constraints/minimal-diff" })],
      [],
      crossSessionEvidence,
    );

    const sameSessionClaim = sameSession.accepted[0] ?? sameSession.tentative[0]!;
    const crossSessionClaim = crossSession.accepted[0] ?? crossSession.tentative[0]!;

    expect(crossSessionClaim.sessionCoverageBonus).toBeGreaterThan(sameSessionClaim.sessionCoverageBonus);
    expect(crossSessionClaim.confidence).toBeGreaterThan(sameSessionClaim.confidence);
  });

  it("matches the merged claims golden snapshot", () => {
    const expected = readFileSync(path.resolve("tests/golden/merged-claims.json"), "utf8");
    const evidence = [
      makeEvidence({ evidenceID: "ev:1", citation: { evidenceID: "ev:1", sessionID: "ses_1", sourceType: "message" }, dimensions: ["constraint"] }),
      makeEvidence({ evidenceID: "ev:2", citation: { evidenceID: "ev:2", sessionID: "ses_2", sourceType: "message" }, dimensions: ["constraint"] }),
      makeEvidence({ evidenceID: "ev:3", citation: { evidenceID: "ev:3", sessionID: "ses_3", sourceType: "message" }, dimensions: ["work-style"] }),
      makeEvidence({ evidenceID: "ev:4", citation: { evidenceID: "ev:4", sessionID: "ses_4", sourceType: "message" }, dimensions: ["work-style"] }),
    ];

    const result = mergeClaims(
      [
        makeConstraintClaim("claim:rule:1", { type: "rule", ruleID: "extract-constraints/minimal-diff" }),
        makeWorkStyleClaim("claim:rule:analysis", "analysis-first", "ev:3"),
        makeWorkStyleClaim("claim:rule:implementation", "implementation-first", "ev:4"),
      ],
      [
        makeConstraintClaim("claim:llm:1", {
          type: "llm-session",
          traceID: "trace_1",
          promptSetVersion: "prompt-set/v1",
          sessionID: "ses_2",
        }, { label: "Minimal Diff" as CandidateClaim<"constraint">["label"], confidence: 0.78 }),
        makeConstraintClaim(
          "claim:llm:bad",
          {
            type: "llm-category",
            traceID: "trace_bad",
            promptSetVersion: "prompt-set/v1",
            dimension: "constraint",
          },
          {
            citations: [
              {
                evidenceID: "ev:missing",
                sessionID: "ses_1",
                sourceType: "message",
              },
            ],
          },
        ),
      ],
      evidence,
    );

    expect(`${JSON.stringify(result, null, 2)}\n`).toBe(expected);
  });

  it("is deterministic for repeated runs with identical inputs", () => {
    const evidence = [
      makeEvidence({ evidenceID: "ev:1", citation: { evidenceID: "ev:1", sessionID: "ses_1", sourceType: "message" }, dimensions: ["constraint"] }),
      makeEvidence({ evidenceID: "ev:2", citation: { evidenceID: "ev:2", sessionID: "ses_2", sourceType: "message" }, dimensions: ["constraint"] }),
    ];
    const ruleClaims = [
      makeConstraintClaim("claim:rule:1", { type: "rule", ruleID: "extract-constraints/minimal-diff" }),
    ];
    const llmClaims = [
      makeConstraintClaim("claim:llm:1", {
        type: "llm-category",
        traceID: "trace_category",
        promptSetVersion: "prompt-set/v1",
        dimension: "constraint",
      }, { confidence: 0.82 }),
    ];

    const first = mergeClaims(ruleClaims, llmClaims, evidence);
    const second = mergeClaims(ruleClaims, llmClaims, evidence);

    expect(second).toEqual(first);
  });
});
