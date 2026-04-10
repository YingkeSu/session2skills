import { describe, expect, it } from "vitest";

import { buildMergedRuleClaims, buildPreferenceProfile, extractAllRuleClaims } from "../src/profile/build-profile.js";
import { buildProfileV2 } from "../src/profile/profile-v2.js";
import { sampleNormalizedSessions } from "./fixtures/sample-normalized-session.js";

describe("buildPreferenceProfile", () => {
  it("extracts stable top-level signals from normalized sessions", () => {
    const profile = buildPreferenceProfile(sampleNormalizedSessions);

    expect(profile.workStyle[0]?.value).toBe("analysis-first");
    expect(profile.validationHabits[0]?.value).toBe("run-diagnostics");
    expect(profile.communicationStyle.length).toBeGreaterThan(0);
  });
});

describe("extractAllRuleClaims", () => {
  it("produces CandidateClaim[] with required fields", () => {
    const claims = extractAllRuleClaims(sampleNormalizedSessions);

    expect(claims.length).toBeGreaterThan(0);

    for (const claim of claims) {
      expect(claim.schemaVersion).toBe("candidate-claim/v1");
      expect(claim.claimID).toMatch(/^claim:/);
      expect(claim.dimension).toBeTruthy();
      expect(claim.label).toBeTruthy();
      expect(claim.confidence).toBeGreaterThan(0);
      expect(claim.confidence).toBeLessThanOrEqual(1);
      expect(claim.rationale).toBeTruthy();
      expect(claim.citations.length).toBeGreaterThan(0);
      expect(claim.source.type).toBe("rule");
      if (claim.source.type === "rule") {
        expect(claim.source.ruleID).toContain("/");
      }
    }
  });

  it("produces claims sorted by confidence descending", () => {
    const claims = extractAllRuleClaims(sampleNormalizedSessions);

    for (let i = 1; i < claims.length; i++) {
      expect(claims[i].confidence).toBeLessThanOrEqual(claims[i - 1].confidence);
    }
  });

  it("preserves validation-habit detection quality", () => {
    const claims = extractAllRuleClaims(sampleNormalizedSessions);
    const validationClaims = claims.filter((c) => c.dimension === "validation-habit");

    expect(validationClaims.length).toBeGreaterThan(0);
    const diagnosticsClaim = validationClaims.find((c) => c.label === "run-diagnostics");
    expect(diagnosticsClaim).toBeDefined();
    expect(diagnosticsClaim!.confidence).toBeGreaterThan(0);
    expect(diagnosticsClaim!.citations.length).toBeGreaterThan(0);
  });

  it("separates explicit-user constraints with higher confidence than inferred", () => {
    const claims = extractAllRuleClaims(sampleNormalizedSessions);
    const constraintClaims = claims.filter((c) => c.dimension === "constraint");
    const inferredClaims = claims.filter((c) => c.dimension !== "constraint");

    if (constraintClaims.length > 0 && inferredClaims.length > 0) {
      const avgConstraint = constraintClaims.reduce((s, c) => s + c.confidence, 0) / constraintClaims.length;
      const avgInferred = inferredClaims.reduce((s, c) => s + c.confidence, 0) / inferredClaims.length;
      expect(avgConstraint).toBeGreaterThanOrEqual(avgInferred);
    }
  });
});

describe("buildProfileV2", () => {
  it("separates strongest, accepted, tentative, and unresolved claims", () => {
    const mergedClaims = buildMergedRuleClaims(sampleNormalizedSessions);
    const profile = buildProfileV2(mergedClaims);

    expect(profile.strongestSignals["work-style"][0]?.label).toBe("analysis-first");
    expect(profile.acceptedClaims.some((claim) => claim.dimension === "work-style")).toBe(true);
    expect(profile.tentativeClaims.every((claim) => claim.confidence >= 0.3 && claim.confidence <= 0.7)).toBe(true);
    expect(Array.isArray(profile.unresolvedAreas)).toBe(true);
    expect(profile.confidenceNotes.length).toBeGreaterThan(0);
  });
});
