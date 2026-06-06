import { describe, expect, it } from "vitest";

import type { NormalizedMessage, NormalizedSession } from "../src/normalize/models.js";
import { extractTokenEfficiencyClaims } from "../src/analyze/extract-token-efficiency.js";

function makeTokens(input: number, output: number, reasoning: number, cacheRead = 0, cacheWrite = 0) {
  return { input, output, reasoning, cache: { read: cacheRead, write: cacheWrite } };
}

function makeSession(id: string, messages: Array<Partial<NormalizedMessage>>): NormalizedSession {
  return {
    id,
    title: `Session ${id}`,
    directory: "/test",
    updatedAt: Date.now(),
    messages: messages.map((m, i) => ({
      id: m.id ?? `msg_${i}`,
      role: m.role ?? "user",
      timestamp: Date.now(),
      text: m.text ?? "",
      parts: [],
      toolInvocations: [],
      evidence: { sessionID: id, sourceType: "message" },
      tokens: m.tokens,
      agent: m.agent,
    })),
    toolInvocations: [],
    steps: [],
  };
}

describe("extractTokenEfficiencyClaims", () => {
  it("detects explorer pattern (high input, low output)", () => {
    const sessions = [
      makeSession("s1", [
        { role: "assistant", tokens: makeTokens(10000, 200, 500) },
        { role: "assistant", tokens: makeTokens(8000, 300, 400) },
      ]),
      makeSession("s2", [
        { role: "assistant", tokens: makeTokens(15000, 500, 600) },
      ]),
    ];

    const claims = extractTokenEfficiencyClaims(sessions);
    const explorer = claims.find((c) => c.label === "explorer");
    expect(explorer).toBeDefined();
    expect(explorer!.rationale).toContain("input-to-output");
    expect(explorer!.citations).toHaveLength(2);
  });

  it("detects implementer pattern (high output relative to input)", () => {
    const sessions = [
      makeSession("s1", [
        { role: "assistant", tokens: makeTokens(100, 500, 50) },
        { role: "assistant", tokens: makeTokens(200, 800, 50) },
      ]),
    ];

    const claims = extractTokenEfficiencyClaims(sessions);
    const implementer = claims.find((c) => c.label === "implementer");
    expect(implementer).toBeDefined();
    expect(implementer!.citations).toHaveLength(1);
  });

  it("detects analytical pattern (high reasoning tokens)", () => {
    const sessions = [
      makeSession("s1", [
        { role: "assistant", tokens: makeTokens(1000, 500, 800) },
      ]),
    ];

    const claims = extractTokenEfficiencyClaims(sessions);
    const analytical = claims.find((c) => c.label === "analytical");
    expect(analytical).toBeDefined();
    expect(analytical!.rationale).toContain("reasoning");
  });

  it("detects context-reuser pattern (high cache read)", () => {
    const sessions = [
      makeSession("s1", [
        { role: "assistant", tokens: makeTokens(5000, 1000, 100, 3000, 0) },
      ]),
    ];

    const claims = extractTokenEfficiencyClaims(sessions);
    const reuser = claims.find((c) => c.label === "context-reuser");
    expect(reuser).toBeDefined();
    expect(reuser!.rationale).toContain("cache read");
  });

  it("returns no claims for sessions without token data", () => {
    const sessions = [
      makeSession("s1", [{ role: "assistant" }]),
      makeSession("s2", [{ role: "user", text: "hello" }]),
    ];

    const claims = extractTokenEfficiencyClaims(sessions);
    expect(claims).toHaveLength(0);
  });

  it("returns no claims for empty sessions array", () => {
    const claims = extractTokenEfficiencyClaims([]);
    expect(claims).toHaveLength(0);
  });

  it("skips sessions with zero input tokens", () => {
    const sessions = [
      makeSession("s1", [
        { role: "assistant", tokens: makeTokens(0, 0, 0) },
      ]),
    ];

    const claims = extractTokenEfficiencyClaims(sessions);
    expect(claims).toHaveLength(0);
  });

  it("detects multiple patterns in the same session set", () => {
    const sessions = [
      makeSession("s1", [
        { role: "assistant", tokens: makeTokens(10000, 200, 50) }, // explorer
      ]),
      makeSession("s2", [
        { role: "assistant", tokens: makeTokens(100, 500, 50) }, // implementer
      ]),
    ];

    const claims = extractTokenEfficiencyClaims(sessions);
    expect(claims.length).toBeGreaterThanOrEqual(2);
    expect(claims.map((c) => c.label)).toContain("explorer");
    expect(claims.map((c) => c.label)).toContain("implementer");
  });

  it("sorts claims by confidence descending", () => {
    const sessions = [
      makeSession("s1", [{ role: "assistant", tokens: makeTokens(10000, 200, 50) }]),
      makeSession("s2", [{ role: "assistant", tokens: makeTokens(10000, 100, 50) }]),
      makeSession("s3", [{ role: "user", text: "no tokens" }]),
    ];

    const claims = extractTokenEfficiencyClaims(sessions);
    for (let i = 1; i < claims.length; i++) {
      expect(claims[i].confidence).toBeLessThanOrEqual(claims[i - 1].confidence);
    }
  });

  it("uses correct dimension and source", () => {
    const sessions = [
      makeSession("s1", [
        { role: "assistant", tokens: makeTokens(10000, 200, 50) },
      ]),
    ];

    const claims = extractTokenEfficiencyClaims(sessions);
    for (const claim of claims) {
      expect(claim.dimension).toBe("token-efficiency");
      if (claim.source.type !== "rule") {
        throw new Error(`Expected rule source, received ${claim.source.type}`);
      }
      expect(claim.source.ruleID).toBe(`extract-token-efficiency/${claim.label}`);
    }
  });
});
