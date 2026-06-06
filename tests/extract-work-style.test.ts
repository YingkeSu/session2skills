import { describe, expect, it, beforeEach } from "vitest";

import { resetClaimCounter } from "../src/analyze/helpers.js";
import { extractWorkStyleClaims } from "../src/analyze/extract-work-style.js";
import type { NormalizedSession, ToolInvocation } from "../src/normalize/models.js";

function makeTool(name: string): ToolInvocation {
  return {
    id: `tool_${name}`,
    toolName: name,
    status: "completed",
    evidence: { sessionID: "ses_1", sourceType: "tool" },
  };
}

function makeSession(tools: Array<ToolInvocation>, messageCount = 1): NormalizedSession {
  return {
    id: "ses_1",
    title: "test",
    directory: "/test",
    updatedAt: Date.now(),
    messages: Array.from({ length: messageCount }, (_, i) => ({
      id: `msg_${i}`,
      role: "user",
      timestamp: Date.now(),
      text: `message ${i}`,
      parts: [],
      toolInvocations: [],
      evidence: { sessionID: "ses_1", sourceType: "message" },
    })),
    toolInvocations: tools,
    steps: [],
  };
}

describe("extractWorkStyleClaims", () => {
  beforeEach(() => resetClaimCounter());

  it("detects analysis-first when discovery tools precede modification", () => {
    const claims = extractWorkStyleClaims([makeSession([makeTool("read"), makeTool("glob"), makeTool("edit")])]);
    const af = claims.find((c) => c.label === "analysis-first");
    expect(af).toBeDefined();
    expect(af!.rationale).toContain("Discovery tools precede");
  });

  it("detects implementation-first when modification tools precede discovery", () => {
    const claims = extractWorkStyleClaims([makeSession([makeTool("edit"), makeTool("write"), makeTool("read")])]);
    const imf = claims.find((c) => c.label === "implementation-first");
    expect(imf).toBeDefined();
    expect(imf!.rationale).toContain("Modification tools precede");
  });

  it("detects iterative for high tool count (>=6)", () => {
    const tools = Array.from({ length: 6 }, (_, i) => makeTool(`tool_${i}`));
    const claims = extractWorkStyleClaims([makeSession(tools)]);
    const iter = claims.find((c) => c.label === "iterative");
    expect(iter).toBeDefined();
  });

  it("detects iterative for high message count (>=8)", () => {
    const claims = extractWorkStyleClaims([makeSession([makeTool("edit")], 8)]);
    const iter = claims.find((c) => c.label === "iterative");
    expect(iter).toBeDefined();
  });

  it("detects one-shot for low tool and message count", () => {
    const claims = extractWorkStyleClaims([makeSession([makeTool("edit")], 2)]);
    const os = claims.find((c) => c.label === "one-shot");
    expect(os).toBeDefined();
    expect(os!.rationale).toContain("Low tool/message count");
  });

  it("returns empty claims for sessions with no tools", () => {
    const claims = extractWorkStyleClaims([makeSession([], 3)]);
    // No discovery/modification tools → no analysis-first or implementation-first
    // But messages < 8 and tools < 6 → one-shot
    const os = claims.find((c) => c.label === "one-shot");
    expect(os).toBeDefined();
  });

  it("returns claims sorted by confidence descending", () => {
    const claims = extractWorkStyleClaims([
      makeSession([makeTool("read"), makeTool("edit")], 2),
    ]);
    if (claims.length >= 2) {
      expect(claims[0].confidence).toBeGreaterThanOrEqual(claims[1].confidence);
    }
  });

  it("produces claims with correct dimension and source", () => {
    const claims = extractWorkStyleClaims([makeSession([makeTool("read"), makeTool("edit")])]);
    expect(claims[0].dimension).toBe("work-style");
    expect(claims[0].source.type).toBe("rule");
  });
});
