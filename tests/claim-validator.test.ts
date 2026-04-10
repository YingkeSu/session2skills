import { describe, expect, it } from "vitest";

import {
  normalizeClaimLabel,
  validateClaim,
} from "../src/analyze/claim-validator.js";
import { buildEvidenceIndex } from "../src/analyze/evidence-index.js";
import type { CandidateClaim } from "../src/normalize/models.js";
import { sampleNormalizedSessions } from "./fixtures/sample-normalized-session.js";

const evidenceIndex = buildEvidenceIndex(sampleNormalizedSessions);

function makeClaim(overrides: Partial<CandidateClaim<"constraint">> = {}): CandidateClaim<"constraint"> {
  return {
    schemaVersion: "candidate-claim/v1",
    claimID: "claim:test:1",
    dimension: "constraint",
    label: "minimal-diff",
    confidence: 0.7,
    rationale: "User explicitly asked for small changes",
    citations: [
      {
        evidenceID: "ses_1:msg_1",
        sessionID: "ses_1",
        messageID: "msg_1",
        sourceType: "message",
      },
    ],
    source: { type: "rule", ruleID: "extract-constraints/minimal-diff" },
    ...overrides,
  };
}

describe("normalizeClaimLabel", () => {
  it("normalizes case, spacing, and punctuation", () => {
    expect(normalizeClaimLabel("  Minimal Diff!  ")).toBe("minimal-diff");
    expect(normalizeClaimLabel("Run_Diagnostics")).toBe("run-diagnostics");
  });
});

describe("validateClaim", () => {
  it("accepts valid claims and canonicalizes labels", () => {
    const result = validateClaim(
      makeClaim({ label: " Minimal Diff " as CandidateClaim<"constraint">["label"] }),
      evidenceIndex,
    );

    expect(result.valid).toBe(true);
    if (!result.valid) return;

    expect(result.claim.label).toBe("minimal-diff");
    expect(result.claim.normalizedLabel).toBe("minimal-diff");
    expect(result.claim.citations.map((citation) => citation.evidenceID)).toEqual(["ses_1:msg_1"]);
    expect(result.claim.sessionIDs).toEqual(["ses_1"]);
  });

  it("deduplicates citations and restores canonical citation metadata", () => {
    const result = validateClaim(
      makeClaim({
        citations: [
          {
            evidenceID: "ses_1:tool_1",
            sessionID: "ses_1",
            sourceType: "tool",
          },
          {
            evidenceID: "ses_1:msg_1",
            sessionID: "ses_1",
            sourceType: "message",
          },
          {
            evidenceID: "ses_1:msg_1",
            sessionID: "ses_1",
            sourceType: "message",
          },
        ],
      }),
      evidenceIndex,
    );

    expect(result.valid).toBe(true);
    if (!result.valid) return;

    expect(result.claim.citations).toEqual([
      {
        evidenceID: "ses_1:msg_1",
        sessionID: "ses_1",
        messageID: "msg_1",
        sourceType: "message",
        excerpt: "Please analyze the repository first and explain your reasoning.",
      },
      {
        evidenceID: "ses_1:tool_1",
        sessionID: "ses_1",
        sourceType: "tool",
        excerpt: "Tool: read",
      },
    ]);
    expect(result.claim.evidenceCount).toBe(2);
  });

  it("rejects invalid evidence citations", () => {
    const result = validateClaim(
      makeClaim({
        citations: [
          {
            evidenceID: "invented-evidence",
            sessionID: "ses_1",
            sourceType: "message",
          },
        ],
      }),
      evidenceIndex,
    );

    expect(result.valid).toBe(false);
    if (result.valid) return;

    expect(result.errors.some((error) => error.message.includes("unknown evidenceID"))).toBe(true);
  });

  it("rejects citation metadata that disagrees with the evidence index", () => {
    const result = validateClaim(
      makeClaim({
        citations: [
          {
            evidenceID: "ses_1:msg_1",
            sessionID: "ses_other",
            messageID: "msg_1",
            sourceType: "message",
          },
        ],
      }),
      evidenceIndex,
    );

    expect(result.valid).toBe(false);
    if (result.valid) return;

    expect(result.errors.some((error) => error.message.includes("does not match evidence index"))).toBe(true);
  });

  it("rejects labels outside the taxonomy", () => {
    const result = validateClaim(
      makeClaim({ label: "large-refactor" as CandidateClaim<"constraint">["label"] }),
      evidenceIndex,
    );

    expect(result.valid).toBe(false);
    if (result.valid) return;

    expect(result.errors.some((error) => error.field === "label")).toBe(true);
  });

  it("reports multiple schema and source validation issues together", () => {
    const result = validateClaim(
      makeClaim({
        schemaVersion: "candidate-claim/v2" as CandidateClaim["schemaVersion"],
        claimID: " ",
        confidence: 1.5,
        rationale: " ",
        source: { type: "mystery" } as unknown as CandidateClaim["source"],
      }),
      evidenceIndex,
    );

    expect(result.valid).toBe(false);
    if (result.valid) return;

    expect(result.errors.map((error) => error.field)).toEqual(
      expect.arrayContaining(["schemaVersion", "claimID", "confidence", "rationale", "source.type"]),
    );
  });
});
