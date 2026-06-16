import { describe, expect, it } from "vitest";

import type { HarnessResult } from "../src/harness/types.js";
import { renderSummary } from "../src/generate/render-summary.js";
import {
  makeClaimManifest,
  makeManifestClaim,
  makeSkepticIssue,
  makeSkepticReport,
  makeVerifierIssue,
  makeVerifierReport,
  makeWriterOutput,
} from "./harness/fixtures.js";

function makeHarnessResult(overrides?: {
  revisedManifest?: ReturnType<typeof makeClaimManifest>;
  skepticReport?: ReturnType<typeof makeSkepticReport>;
  verifierReport?: ReturnType<typeof makeVerifierReport>;
}): HarnessResult {
  const manifest = overrides?.revisedManifest ?? makeClaimManifest();
  return {
    manifest,
    skepticReport: overrides?.skepticReport ?? makeSkepticReport(),
    writerOutput: makeWriterOutput(),
    verifierReport: overrides?.verifierReport ?? makeVerifierReport(),
    traces: [],
    revisedManifest: manifest,
  };
}

describe("renderSummary", () => {
  it("renders claim dimensions from the manifest", () => {
    const result = makeHarnessResult({
      revisedManifest: makeClaimManifest({
        claims: [
          makeManifestClaim({
            id: "claim_a",
            dimension: "work-style",
            label: "tdd",
            confidence: 0.9,
          }),
          makeManifestClaim({
            id: "claim_b",
            dimension: "constraint",
            label: "minimal-diff",
            confidence: 0.8,
          }),
        ],
        dimensionsCovered: ["work-style", "constraint"],
      }),
    });

    const markdown = renderSummary(result);

    expect(markdown).toContain("### Work style");
    expect(markdown).toContain("tdd");
    expect(markdown).toContain("### Constraints");
    expect(markdown).toContain("minimal-diff");
    expect(markdown).toContain("0.90");
    expect(markdown).toContain("0.80");
  });

  it("renders the skeptic overall score formatted to two decimals", () => {
    const result = makeHarnessResult({
      skepticReport: makeSkepticReport({ overallScore: 0.7 }),
    });

    const markdown = renderSummary(result);

    expect(markdown).toContain("overall score: 0.70");
  });

  it("lists high-severity skeptic issues with claim id and detail", () => {
    const result = makeHarnessResult({
      skepticReport: makeSkepticReport({
        issues: [
          makeSkepticIssue({
            claimId: "claim_high",
            severity: "high",
            problemType: "unsupported",
            detail: "No evidence backs this claim",
          }),
          makeSkepticIssue({
            claimId: "claim_med",
            severity: "medium",
            problemType: "vague",
            detail: "Detail is fuzzy",
          }),
        ],
      }),
    });

    const markdown = renderSummary(result);

    expect(markdown).toContain("issues: 2");
    expect(markdown).toContain("claim_high");
    expect(markdown).toContain("unsupported");
    expect(markdown).toContain("No evidence backs this claim");
    expect(markdown).toContain("### High-severity issues");
  });

  it("renders the verifier PASSED status", () => {
    const result = makeHarnessResult({
      verifierReport: makeVerifierReport({ pass: true }),
    });

    const markdown = renderSummary(result);

    expect(markdown).toContain("result: PASSED");
  });

  it("renders the verifier FAILED status and fabricated count", () => {
    const result = makeHarnessResult({
      verifierReport: makeVerifierReport({
        pass: false,
        issues: [
          makeVerifierIssue({
            description: "Fabricated directive",
            location: "Workflow",
            severity: "high",
          }),
        ],
        metadata: {
          generatedAt: "2026-05-26T00:00:00.000Z",
          directiveCount: 3,
          verifiedCount: 2,
          fabricatedCount: 1,
        },
      }),
    });

    const markdown = renderSummary(result);

    expect(markdown).toContain("result: FAILED");
    expect(markdown).toContain("fabricated directives: 1");
    expect(markdown).toContain("Fabricated directive");
  });

  it("hides claim rationale when tone is concise", () => {
    const result = makeHarnessResult({
      revisedManifest: makeClaimManifest({
        claims: [
          makeManifestClaim({ rationale: "secret reasoning" }),
        ],
      }),
    });

    const markdown = renderSummary(result, { tone: "concise" });

    expect(markdown).not.toContain("secret reasoning");
  });

  it("shows claim rationale when tone is detailed", () => {
    const result = makeHarnessResult({
      revisedManifest: makeClaimManifest({
        claims: [
          makeManifestClaim({ rationale: "detailed reasoning" }),
        ],
      }),
    });

    const markdown = renderSummary(result, { tone: "detailed" });

    expect(markdown).toContain("detailed reasoning");
  });

  it("renders confidence notes when provided", () => {
    const result = makeHarnessResult();

    const markdown = renderSummary(result, { confidenceNotes: ["a note", "another note"] });

    expect(markdown).toContain("## Confidence Notes");
    expect(markdown).toContain("- a note");
    expect(markdown).toContain("- another note");
  });

  it("omits the confidence notes section when none are provided", () => {
    const result = makeHarnessResult();

    const markdown = renderSummary(result);

    expect(markdown).not.toContain("## Confidence Notes");
  });
});
