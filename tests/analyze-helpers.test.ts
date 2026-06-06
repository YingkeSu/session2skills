import { describe, expect, it, beforeEach } from "vitest";

import {
  resetClaimCounter,
  createSignal,
  createRuleClaim,
  toCitations,
  getUserMessages,
  dedupeEvidence,
  takeEvidence,
  confidenceFromCount,
} from "../src/analyze/helpers.js";
import type {
  EvidenceRef,
  NormalizedMessage,
  NormalizedSession,
} from "../src/normalize/models.js";

// ---------------------------------------------------------------------------
// Inline factories
// ---------------------------------------------------------------------------

function makeEvidence(overrides: Partial<EvidenceRef> = {}): EvidenceRef {
  return {
    sessionID: "ses_001",
    messageID: "msg_001",
    partID: "part_001",
    sourceType: "message",
    excerpt: "test evidence",
    ...overrides,
  };
}

function makeMessage(overrides: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return {
    id: "msg_001",
    role: "user",
    timestamp: Date.now(),
    text: "hello",
    parts: [],
    toolInvocations: [],
    evidence: makeEvidence(),
    ...overrides,
  };
}

function makeSession(overrides: Partial<NormalizedSession> = {}): NormalizedSession {
  return {
    id: "ses_001",
    title: "test session",
    directory: "/test",
    updatedAt: Date.now(),
    messages: [makeMessage()],
    toolInvocations: [],
    steps: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resetClaimCounter + createRuleClaim
// ---------------------------------------------------------------------------

describe("resetClaimCounter / createRuleClaim", () => {
  beforeEach(() => {
    resetClaimCounter();
  });

  it("resets the claim counter so IDs restart from 1", () => {
    const claim1 = createRuleClaim("ext", "rule1", "work-style", "iterative", 0.8, "test", []);
    expect(claim1.claimID).toBe("claim:ext:1");

    resetClaimCounter();

    const claim2 = createRuleClaim("ext", "rule2", "work-style", "iterative", 0.7, "test", []);
    expect(claim2.claimID).toBe("claim:ext:1");
  });

  it("auto-increments claim IDs within the same extractor", () => {
    const c1 = createRuleClaim("ws", "a", "work-style", "iterative", 0.8, "r1", []);
    const c2 = createRuleClaim("ws", "b", "work-style", "one-shot", 0.6, "r2", []);
    expect(c1.claimID).toBe("claim:ws:1");
    expect(c2.claimID).toBe("claim:ws:2");
  });

  it("populates all CandidateClaim fields correctly", () => {
    const citations = toCitations([makeEvidence()]);
    const claim = createRuleClaim("ext", "rule1", "constraint", "minimal-diff", 0.9, "rationale text", citations);

    expect(claim.schemaVersion).toBe("candidate-claim/v1");
    expect(claim.dimension).toBe("constraint");
    expect(claim.label).toBe("minimal-diff");
    expect(claim.confidence).toBe(0.9);
    expect(claim.rationale).toBe("rationale text");
    expect(claim.citations).toEqual(citations);
    expect(claim.source).toEqual({ type: "rule", ruleID: "ext/rule1" });
  });
});

// ---------------------------------------------------------------------------
// createSignal
// ---------------------------------------------------------------------------

describe("createSignal", () => {
  it("returns a WorkflowSignal with default weight equal to evidence length", () => {
    const evidence = [makeEvidence(), makeEvidence(), makeEvidence()];
    const signal = createSignal("work-style", "iterative", evidence);

    expect(signal.kind).toBe("work-style");
    expect(signal.value).toBe("iterative");
    expect(signal.weight).toBe(3);
    expect(signal.evidence).toBe(evidence);
  });

  it("allows overriding weight", () => {
    const signal = createSignal("work-style", "iterative", [makeEvidence()], 10);
    expect(signal.weight).toBe(10);
  });

  it("defaults weight to 0 for empty evidence", () => {
    const signal = createSignal("work-style", "iterative", []);
    expect(signal.weight).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// toCitations
// ---------------------------------------------------------------------------

describe("toCitations", () => {
  it("converts EvidenceRef[] to EvidenceCitation[] with evidenceID", () => {
    const refs = [makeEvidence({ sessionID: "s1", messageID: "m1", partID: "p1" })];
    const citations = toCitations(refs);

    expect(citations).toHaveLength(1);
    expect(citations[0].evidenceID).toBe("s1:m1:p1");
    expect(citations[0].sessionID).toBe("s1");
  });

  it("handles missing optional fields with empty strings", () => {
    const refs = [makeEvidence({ sessionID: "s1" })]; // no messageID, no partID
    delete refs[0].messageID;
    delete refs[0].partID;
    const citations = toCitations(refs);

    expect(citations[0].evidenceID).toBe("s1::");
  });

  it("deduplicates evidence before converting", () => {
    const refs = [
      makeEvidence({ sessionID: "s1", messageID: "m1", partID: "p1", sourceType: "message", excerpt: "a" }),
      makeEvidence({ sessionID: "s1", messageID: "m1", partID: "p1", sourceType: "message", excerpt: "a" }),
    ];
    const citations = toCitations(refs);
    expect(citations).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getUserMessages
// ---------------------------------------------------------------------------

describe("getUserMessages", () => {
  it("filters messages by role 'user'", () => {
    const sessions = [makeSession({
      messages: [
        makeMessage({ id: "m1", role: "user", text: "hello" }),
        makeMessage({ id: "m2", role: "assistant", text: "hi" }),
        makeMessage({ id: "m3", role: "user", text: "world" }),
      ],
    })];
    const userMessages = getUserMessages(sessions);

    expect(userMessages).toHaveLength(2);
    expect(userMessages[0].text).toBe("hello");
    expect(userMessages[1].text).toBe("world");
  });

  it("returns empty array for sessions with no user messages", () => {
    const sessions = [makeSession({
      messages: [makeMessage({ role: "assistant", text: "hi" })],
    })];
    expect(getUserMessages(sessions)).toHaveLength(0);
  });

  it("returns empty array for empty sessions", () => {
    expect(getUserMessages([])).toHaveLength(0);
  });

  it("flattens messages across multiple sessions", () => {
    const sessions = [
      makeSession({ id: "s1", messages: [makeMessage({ id: "m1", role: "user" })] }),
      makeSession({ id: "s2", messages: [makeMessage({ id: "m2", role: "user" })] }),
    ];
    expect(getUserMessages(sessions)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// dedupeEvidence
// ---------------------------------------------------------------------------

describe("dedupeEvidence", () => {
  it("removes exact duplicates by composite key", () => {
    const evidence = [
      makeEvidence({ sessionID: "s1", messageID: "m1", partID: "p1", sourceType: "message", excerpt: "a" }),
      makeEvidence({ sessionID: "s1", messageID: "m1", partID: "p1", sourceType: "message", excerpt: "a" }),
    ];
    expect(dedupeEvidence(evidence)).toHaveLength(1);
  });

  it("keeps items that differ by any key component", () => {
    const evidence = [
      makeEvidence({ sessionID: "s1", messageID: "m1", sourceType: "message", excerpt: "a" }),
      makeEvidence({ sessionID: "s1", messageID: "m2", sourceType: "message", excerpt: "a" }),
      makeEvidence({ sessionID: "s1", messageID: "m1", sourceType: "tool", excerpt: "a" }),
    ];
    expect(dedupeEvidence(evidence)).toHaveLength(3);
  });

  it("returns empty for empty input", () => {
    expect(dedupeEvidence([])).toHaveLength(0);
  });

  it("preserves original order", () => {
    const evidence = [
      makeEvidence({ sessionID: "s1", excerpt: "first" }),
      makeEvidence({ sessionID: "s2", excerpt: "second" }),
      makeEvidence({ sessionID: "s1", excerpt: "first" }), // duplicate
      makeEvidence({ sessionID: "s3", excerpt: "third" }),
    ];
    const result = dedupeEvidence(evidence);
    expect(result).toHaveLength(3);
    expect(result[0].excerpt).toBe("first");
    expect(result[1].excerpt).toBe("second");
    expect(result[2].excerpt).toBe("third");
  });
});

// ---------------------------------------------------------------------------
// takeEvidence
// ---------------------------------------------------------------------------

describe("takeEvidence", () => {
  it("returns up to limit items after dedup", () => {
    const evidence = Array.from({ length: 10 }, (_, i) =>
      makeEvidence({ sessionID: `s${i}`, excerpt: `ev${i}` }),
    );
    expect(takeEvidence(evidence, 3)).toHaveLength(3);
  });

  it("returns all items if fewer than limit", () => {
    const evidence = [makeEvidence({ sessionID: "s1" }), makeEvidence({ sessionID: "s2" })];
    expect(takeEvidence(evidence, 5)).toHaveLength(2);
  });

  it("defaults to limit of 5", () => {
    const evidence = Array.from({ length: 10 }, (_, i) =>
      makeEvidence({ sessionID: `s${i}` }),
    );
    expect(takeEvidence(evidence)).toHaveLength(5);
  });

  it("deduplicates before taking", () => {
    const evidence = [
      makeEvidence({ sessionID: "s1", excerpt: "a" }),
      makeEvidence({ sessionID: "s1", excerpt: "a" }),
      makeEvidence({ sessionID: "s2", excerpt: "b" }),
    ];
    const result = takeEvidence(evidence, 5);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// confidenceFromCount
// ---------------------------------------------------------------------------

describe("confidenceFromCount", () => {
  it("returns 0 when total is 0", () => {
    expect(confidenceFromCount(0, 0)).toBe(0);
  });

  it("returns higher confidence for higher count/total ratio", () => {
    const low = confidenceFromCount(1, 100);
    const high = confidenceFromCount(50, 100);
    expect(high).toBeGreaterThan(low);
  });

  it("caps at 1.0", () => {
    const result = confidenceFromCount(100, 1);
    expect(result).toBeLessThanOrEqual(1);
  });

  it("isExplicit produces higher confidence than inferred", () => {
    const inferred = confidenceFromCount(5, 10, false);
    const explicit = confidenceFromCount(5, 10, true);
    expect(explicit).toBeGreaterThan(inferred);
  });

  it("base for inferred starts around 0.5", () => {
    const result = confidenceFromCount(0, 10, false);
    expect(result).toBeGreaterThanOrEqual(0.5);
    expect(result).toBeLessThan(0.7);
  });

  it("base for explicit starts around 0.8", () => {
    const result = confidenceFromCount(0, 10, true);
    expect(result).toBeGreaterThanOrEqual(0.8);
    expect(result).toBeLessThan(1);
  });
});
