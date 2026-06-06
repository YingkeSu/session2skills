import { describe, expect, it, beforeEach } from "vitest";

import { resetClaimCounter } from "../src/analyze/helpers.js";
import { extractConstraintClaims } from "../src/analyze/extract-constraints.js";
import type { NormalizedSession, NormalizedMessage } from "../src/normalize/models.js";

function makeMessage(text: string): NormalizedMessage {
  return {
    id: `msg_${text.slice(0, 8)}`,
    role: "user",
    timestamp: Date.now(),
    text,
    parts: [],
    toolInvocations: [],
    evidence: { sessionID: "ses_1", sourceType: "message" },
  };
}

function makeSession(messages: Array<NormalizedMessage>): NormalizedSession {
  return {
    id: "ses_1",
    title: "test",
    directory: "/test",
    updatedAt: Date.now(),
    messages,
    toolInvocations: [],
    steps: [],
  };
}

describe("extractConstraintClaims", () => {
  beforeEach(() => resetClaimCounter());

  it("detects 'minimal-diff' constraint", () => {
    const claims = extractConstraintClaims([makeSession([makeMessage("Please make minimal changes")])]);
    expect(claims.length).toBeGreaterThanOrEqual(1);
    const md = claims.find((c) => c.label === "minimal-diff");
    expect(md).toBeDefined();
    expect(md!.rationale).toContain("minimal-diff");
  });

  it("detects 'preserve-patterns' constraint", () => {
    const claims = extractConstraintClaims([makeSession([makeMessage("Follow existing patterns in the code")])]);
    const pp = claims.find((c) => c.label === "preserve-patterns");
    expect(pp).toBeDefined();
  });

  it("detects 'type-safety' constraint", () => {
    const claims = extractConstraintClaims([makeSession([makeMessage("Ensure type safety and strict types")])]);
    const ts = claims.find((c) => c.label === "type-safety");
    expect(ts).toBeDefined();
  });

  it("detects 'avoid-destructive-actions' constraint", () => {
    const claims = extractConstraintClaims([makeSession([makeMessage("avoid destructive operations")])]);
    const ad = claims.find((c) => c.label === "avoid-destructive-actions");
    expect(ad).toBeDefined();
  });

  it("detects Chinese constraint patterns", () => {
    const claims = extractConstraintClaims([makeSession([makeMessage("尽量少改代码")])]);
    const md = claims.find((c) => c.label === "minimal-diff");
    expect(md).toBeDefined();
  });

  it("returns empty claims when no constraints match", () => {
    const claims = extractConstraintClaims([makeSession([makeMessage("Build a new feature from scratch")])]);
    expect(claims).toHaveLength(0);
  });

  it("returns empty claims for sessions with no user messages", () => {
    const claims = extractConstraintClaims([makeSession([])]);
    expect(claims).toHaveLength(0);
  });

  it("returns claims sorted by confidence descending", () => {
    const claims = extractConstraintClaims([makeSession([
      makeMessage("minimal diff please"),
      makeMessage("minimal diff again"),
      makeMessage("type safety"),
    ])]);
    if (claims.length >= 2) {
      expect(claims[0].confidence).toBeGreaterThanOrEqual(claims[1].confidence);
    }
  });

  it("produces claims with correct dimension and source", () => {
    const claims = extractConstraintClaims([makeSession([makeMessage("type safety is important")])]);
    expect(claims[0].dimension).toBe("constraint");
    expect(claims[0].source.type).toBe("rule");
  });
});
