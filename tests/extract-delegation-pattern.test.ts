import { describe, expect, it } from "vitest";

import type { NormalizedSession } from "../src/normalize/models.js";
import { extractDelegationPatternClaims } from "../src/analyze/extract-delegation-pattern.js";

function makeSession(id: string, parentID?: string, agent?: string): NormalizedSession {
  return {
    id,
    title: `Session ${id}`,
    directory: "/test",
    updatedAt: Date.now(),
    messages: [{
      id: `msg_${id}`,
      role: "user",
      timestamp: Date.now(),
      text: "test",
      parts: [],
      toolInvocations: [],
      evidence: { sessionID: id, sourceType: "message" },
    }],
    toolInvocations: [],
    steps: [],
    parentID,
    agent,
  };
}

describe("extractDelegationPatternClaims", () => {
  it("detects hands-on pattern (flat session, no children)", () => {
    const sessions = [
      makeSession("root1"),
    ];

    const claims = extractDelegationPatternClaims(sessions);
    const handsOn = claims.find((c) => c.label === "hands-on");
    expect(handsOn).toBeDefined();
    expect(handsOn!.rationale).toContain("Shallow delegation");
  });

  it("detects hands-on pattern (few children, depth 1)", () => {
    const sessions = [
      makeSession("root"),
      makeSession("child1", "root"),
      makeSession("child2", "root"),
    ];

    const claims = extractDelegationPatternClaims(sessions);
    const handsOn = claims.find((c) => c.label === "hands-on");
    expect(handsOn).toBeDefined();
  });

  it("detects trusting pattern (deep delegation chain)", () => {
    const sessions = [
      makeSession("root", undefined, "Sisyphus"),
      makeSession("child1", "root", "explore"),
      makeSession("child2", "child1", "explore"),
      makeSession("child3", "child2", "librarian"),
    ];

    const claims = extractDelegationPatternClaims(sessions);
    const trusting = claims.find((c) => c.label === "trusting");
    expect(trusting).toBeDefined();
    expect(trusting!.rationale).toContain("depth ≥ 3");
  });

  it("detects parallelizer pattern (wide delegation breadth)", () => {
    const sessions = [
      makeSession("root", undefined, "Sisyphus"),
      makeSession("child1", "root", "explore"),
      makeSession("child2", "root", "librarian"),
      makeSession("child3", "root", "explore"),
    ];

    const claims = extractDelegationPatternClaims(sessions);
    const parallelizer = claims.find((c) => c.label === "parallelizer");
    expect(parallelizer).toBeDefined();
    expect(parallelizer!.rationale).toContain("breadth ≥ 3");
  });

  it("returns no claims for empty sessions array", () => {
    const claims = extractDelegationPatternClaims([]);
    expect(claims).toHaveLength(0);
  });

  it("handles circular parentID references safely", () => {
    const sessions = [
      makeSession("a", "b"),
      makeSession("b", "a"),
    ];

    // Should not hang or crash
    const claims = extractDelegationPatternClaims(sessions);
    // Both are roots (their parents aren't in the set via has() check... actually they are)
    // Both have parentID pointing to each other, so both are roots AND children
    // The DFS visited set prevents infinite recursion
    expect(claims).toBeDefined();
  });

  it("classifies sessions with no parentID in set as roots", () => {
    const sessions = [
      makeSession("root"),
      makeSession("orphan", "nonexistent_parent"),
    ];

    const claims = extractDelegationPatternClaims(sessions);
    // Both should be treated as roots
    expect(claims.length).toBeGreaterThanOrEqual(1);
    const handsOn = claims.find((c) => c.label === "hands-on");
    expect(handsOn).toBeDefined();
  });

  it("uses correct dimension and source", () => {
    const sessions = [
      makeSession("root"),
    ];

    const claims = extractDelegationPatternClaims(sessions);
    for (const claim of claims) {
      expect(claim.dimension).toBe("delegation-pattern");
      if (claim.source.type !== "rule") {
        throw new Error(`Expected rule source, received ${claim.source.type}`);
      }
      expect(claim.source.ruleID).toBe(`extract-delegation-pattern/${claim.label}`);
    }
  });

  it("sorts claims by confidence descending", () => {
    const sessions = [
      makeSession("root1"),
      makeSession("root2"),
      makeSession("root3"),
    ];

    const claims = extractDelegationPatternClaims(sessions);
    for (let i = 1; i < claims.length; i++) {
      expect(claims[i].confidence).toBeLessThanOrEqual(claims[i - 1].confidence);
    }
  });
});
