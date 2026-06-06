import { describe, expect, it, beforeEach } from "vitest";

import { resetClaimCounter } from "../src/analyze/helpers.js";
import { extractCommunicationStyleClaims } from "../src/analyze/extract-communication-style.js";
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

describe("extractCommunicationStyleClaims", () => {
  beforeEach(() => resetClaimCounter());

  it("detects concise when average message length <= 280", () => {
    const shortMessages = Array.from({ length: 5 }, (_, i) => makeMessage(`Do task ${i}`));
    const claims = extractCommunicationStyleClaims([makeSession(shortMessages)]);
    const concise = claims.find((c) => c.label === "concise");
    expect(concise).toBeDefined();
    expect(concise!.rationale).toContain("280 threshold");
  });

  it("detects explanatory when average message length > 280", () => {
    const shortText = "B".repeat(50);
    const longText = "A".repeat(500);
    const messages = [
      makeMessage(longText),
      makeMessage(longText),
      makeMessage(shortText),
    ];
    const claims = extractCommunicationStyleClaims([makeSession(messages)]);
    const exp = claims.find((c) => c.label === "explanatory");
    expect(exp).toBeDefined();
    expect(exp!.rationale).toContain(">280 threshold");
  });

  it("detects consultative pattern", () => {
    const claims = extractCommunicationStyleClaims([makeSession([makeMessage("How can I fix this? Can you help?")])]);
    const con = claims.find((c) => c.label === "consultative");
    expect(con).toBeDefined();
    expect(con!.rationale).toContain("Consultative");
  });

  it("detects directive pattern", () => {
    const claims = extractCommunicationStyleClaims([makeSession([makeMessage("Implement the feature now")])]);
    const dir = claims.find((c) => c.label === "directive");
    expect(dir).toBeDefined();
    expect(dir!.rationale).toContain("Directive");
  });

  it("returns empty claims for sessions with no user messages", () => {
    const claims = extractCommunicationStyleClaims([makeSession([])]);
    expect(claims).toHaveLength(0);
  });

  it("returns empty claims when all messages are empty", () => {
    const claims = extractCommunicationStyleClaims([makeSession([makeMessage("   "), makeMessage("")])]);
    expect(claims).toHaveLength(0);
  });

  it("returns claims sorted by confidence descending", () => {
    const messages = [
      makeMessage("How can I implement this?"),  // consultative
      makeMessage("Can you fix the bug?"),       // consultative
      makeMessage("Build feature"),              // directive (short)
    ];
    const claims = extractCommunicationStyleClaims([makeSession(messages)]);
    if (claims.length >= 2) {
      expect(claims[0].confidence).toBeGreaterThanOrEqual(claims[1].confidence);
    }
  });

  it("produces claims with correct dimension", () => {
    const claims = extractCommunicationStyleClaims([makeSession([makeMessage("What is this?")])]);
    expect(claims[0].dimension).toBe("communication-style");
    expect(claims[0].source.type).toBe("rule");
  });
});
