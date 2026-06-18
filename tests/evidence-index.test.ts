import { describe, it, expect } from "vitest";
import {
  buildEvidenceIndex,
  selectEvidenceForBudget,
  isDirectUserEvidence,
} from "../src/harness/evidence-index.js";
import {
  makeEvidenceID,
  makeExcerpt,
  estimateTokens,
} from "../src/shared/evidence.js";
import type { NormalizedSession, EvidenceItem } from "../src/normalize/models.js";

const makeSession = (overrides: Partial<NormalizedSession> = {}): NormalizedSession => ({
  id: "ses_test",
  title: "Test session",
  directory: "/tmp/test",
  updatedAt: 1,
  messages: [],
  toolInvocations: [],
  steps: [],
  ...overrides,
});

const makeUserMessage = (id: string, text: string) => ({
  id,
  role: "user" as const,
  timestamp: 1,
  text,
  parts: [] as Array<never>,
  toolInvocations: [] as Array<never>,
  evidence: {
    sessionID: "ses_test",
    messageID: id,
    sourceType: "message" as const,
    excerpt: text,
  },
});

describe("makeEvidenceID", () => {
  it("returns sessionID only when no message/part", () => {
    expect(makeEvidenceID("ses_1")).toBe("ses_1");
  });

  it("includes messageID when provided", () => {
    expect(makeEvidenceID("ses_1", "msg_1")).toBe("ses_1:msg_1");
  });

  it("includes both messageID and partID when provided", () => {
    expect(makeEvidenceID("ses_1", "msg_1", "part_1")).toBe("ses_1:msg_1:part_1");
  });

  it("is deterministic — same inputs always produce same ID", () => {
    const a = makeEvidenceID("ses_1", "msg_1", "part_1");
    const b = makeEvidenceID("ses_1", "msg_1", "part_1");
    expect(a).toBe(b);
  });
});

describe("makeExcerpt", () => {
  it("returns text as-is when under limit", () => {
    expect(makeExcerpt("short text")).toBe("short text");
  });

  it("truncates long text with ellipsis", () => {
    const long = "a ".repeat(500);
    const result = makeExcerpt(long, 100);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result.endsWith("...")).toBe(true);
  });

  it("trims whitespace", () => {
    expect(makeExcerpt("  hello  ")).toBe("hello");
  });

  it("redacts obvious secrets before truncating", () => {
    expect(makeExcerpt("OPENAI_API_KEY=sk-secretvalue")).toBe("OPENAI_API_KEY=[REDACTED_SECRET]");
  });
});

describe("estimateTokens", () => {
  it("estimates ~4 chars per token", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });
});

describe("buildEvidenceIndex", () => {
  it("produces stable IDs across repeated runs on same input", () => {
    const session = makeSession({
      messages: [makeUserMessage("msg_1", "Hello")],
    });

    const run1 = buildEvidenceIndex([session]);
    const run2 = buildEvidenceIndex([session]);

    const ids1 = run1.map((e) => e.evidenceID);
    const ids2 = run2.map((e) => e.evidenceID);

    expect(ids1).toEqual(ids2);
  });

  it("creates evidence items for each non-empty message", () => {
    const session = makeSession({
      messages: [
        makeUserMessage("msg_1", "First message"),
        makeUserMessage("msg_2", "Second message"),
      ],
    });

    const index = buildEvidenceIndex([session]);
    const msgIds = index
      .filter((e) => e.citation.sourceType === "message")
      .map((e) => e.evidenceID);

    expect(msgIds).toContain("ses_test:msg_1");
    expect(msgIds).toContain("ses_test:msg_2");
  });

  it("creates evidence items for tool invocations", () => {
    const session = makeSession({
      toolInvocations: [
        {
          id: "tool_1",
          toolName: "read",
          status: "completed",
          evidence: {
            sessionID: "ses_test",
            sourceType: "tool" as const,
            excerpt: "read file",
          },
        },
      ],
    });

    const index = buildEvidenceIndex([session]);
    expect(index.some((e) => e.evidenceID === "ses_test:tool_1")).toBe(true);
  });

  it("skips empty messages", () => {
    const session = makeSession({
      messages: [{ ...makeUserMessage("msg_1", "   "), text: "   " }],
    });

    const index = buildEvidenceIndex([session]);
    expect(index).toHaveLength(0);
  });

  it("creates part-level evidence for parts with content", () => {
    const session = makeSession({
      messages: [
        {
          id: "msg_1",
          role: "user",
          timestamp: 1,
          text: "Check this",
          parts: [
            {
              id: "part_1",
              type: "text",
              text: "Some part content",
              evidence: {
                sessionID: "ses_test",
                messageID: "msg_1",
                partID: "part_1",
                sourceType: "part" as const,
              },
            },
          ],
          toolInvocations: [],
          evidence: {
            sessionID: "ses_test",
            messageID: "msg_1",
            sourceType: "message" as const,
            excerpt: "Check this",
          },
        },
      ],
    });

    const index = buildEvidenceIndex([session]);
    expect(index.some((e) => e.evidenceID === "ses_test:msg_1:part_1")).toBe(true);
  });

  it("preserves full provenance in citation", () => {
    const session = makeSession({
      messages: [makeUserMessage("msg_1", "Hello world")],
    });

    const index = buildEvidenceIndex([session]);
    const item = index.find((e) => e.evidenceID === "ses_test:msg_1");

    expect(item?.citation.sessionID).toBe("ses_test");
    expect(item?.citation.messageID).toBe("msg_1");
    expect(item?.citation.sourceType).toBe("message");
    expect(item?.citation.excerpt).toBe("Hello world");
  });

  it("redacts secrets from evidence excerpts and summaries", () => {
    const session = makeSession({
      messages: [makeUserMessage("msg_1", "OPENAI_API_KEY=sk-secretvalue")],
    });

    const index = buildEvidenceIndex([session]);
    const item = index.find((e) => e.evidenceID === "ses_test:msg_1");

    expect(item?.citation.excerpt).toBe("OPENAI_API_KEY=[REDACTED_SECRET]");
    expect(item?.summaryText).toBe("OPENAI_API_KEY=[REDACTED_SECRET]");
  });
});

describe("isDirectUserEvidence", () => {
  it("returns true for message-level evidence without partID", () => {
    const item: EvidenceItem = {
      schemaVersion: "evidence-item/v1",
      evidenceID: "ses_1:msg_1",
      citation: {
        evidenceID: "ses_1:msg_1",
        sessionID: "ses_1",
        messageID: "msg_1",
        sourceType: "message",
        excerpt: "test",
      },
      summaryText: "test",
    };

    expect(isDirectUserEvidence(item)).toBe(true);
  });

  it("returns false for part-level evidence", () => {
    const item: EvidenceItem = {
      schemaVersion: "evidence-item/v1",
      evidenceID: "ses_1:msg_1:part_1",
      citation: {
        evidenceID: "ses_1:msg_1:part_1",
        sessionID: "ses_1",
        messageID: "msg_1",
        partID: "part_1",
        sourceType: "part",
        excerpt: "test",
      },
      summaryText: "test",
    };

    expect(isDirectUserEvidence(item)).toBe(false);
  });

  it("returns true for tool evidence", () => {
    const item: EvidenceItem = {
      schemaVersion: "evidence-item/v1",
      evidenceID: "ses_1:tool_1",
      citation: {
        evidenceID: "ses_1:tool_1",
        sessionID: "ses_1",
        sourceType: "tool",
        excerpt: "test",
      },
      summaryText: "test",
    };

    expect(isDirectUserEvidence(item)).toBe(true);
  });
});

describe("selectEvidenceForBudget", () => {
  it("respects token budget", () => {
    const items: Array<EvidenceItem> = Array.from({ length: 20 }, (_, i) => ({
      schemaVersion: "evidence-item/v1" as const,
      evidenceID: `e_${i}`,
      citation: { evidenceID: `e_${i}`, sessionID: "s1", sourceType: "message" as const, excerpt: `${i}` },
      summaryText: `${i} `.repeat(50).trim(),
    }));

    const result = selectEvidenceForBudget(items, 200, { maxItems: 100 });
    const totalTokens = result.reduce((sum, item) => sum + estimateTokens(item.summaryText), 0);
    expect(totalTokens).toBeLessThanOrEqual(200);
  });

  it("prioritizes direct-user and tool evidence when preferDirectUser is true", () => {
    const toolItem: EvidenceItem = {
      schemaVersion: "evidence-item/v1",
      evidenceID: "tool_first",
      citation: { evidenceID: "tool_first", sessionID: "s1", sourceType: "tool", excerpt: "tool" },
      summaryText: "tool output",
    };
    const userItem: EvidenceItem = {
      schemaVersion: "evidence-item/v1",
      evidenceID: "user_first",
      citation: { evidenceID: "user_first", sessionID: "s1", messageID: "m1", sourceType: "message", excerpt: "user" },
      summaryText: "user instruction",
    };
    const partItem: EvidenceItem = {
      schemaVersion: "evidence-item/v1",
      evidenceID: "part_last",
      citation: { evidenceID: "part_last", sessionID: "s1", messageID: "m2", partID: "p1", sourceType: "part", excerpt: "part" },
      summaryText: "part content",
    };

    const result = selectEvidenceForBudget(
      [partItem, toolItem, userItem],
      10000,
      { preferDirectUser: true },
    );

    const ids = result.map((item) => item.evidenceID);
    expect(ids.indexOf("tool_first")).toBeLessThan(ids.indexOf("part_last"));
    expect(ids.indexOf("user_first")).toBeLessThan(ids.indexOf("part_last"));
  });

  it("deduplicates by evidenceID", () => {
    const item: EvidenceItem = {
      schemaVersion: "evidence-item/v1",
      evidenceID: "dup_1",
      citation: { evidenceID: "dup_1", sessionID: "s1", sourceType: "message", excerpt: "a" },
      summaryText: "a",
    };

    const result = selectEvidenceForBudget([item, item, item], 10000);
    expect(result).toHaveLength(1);
  });

  it("tool evidence gets priority alongside user messages", () => {
    const userItem: EvidenceItem = {
      schemaVersion: "evidence-item/v1",
      evidenceID: "user_1",
      citation: { evidenceID: "user_1", sessionID: "s1", messageID: "m1", sourceType: "message", excerpt: "user" },
      summaryText: "user message",
    };
    const toolItem: EvidenceItem = {
      schemaVersion: "evidence-item/v1",
      evidenceID: "tool_1",
      citation: { evidenceID: "tool_1", sessionID: "s1", sourceType: "tool", excerpt: "tool" },
      summaryText: "tool output",
    };
    const partItem: EvidenceItem = {
      schemaVersion: "evidence-item/v1",
      evidenceID: "part_1",
      citation: { evidenceID: "part_1", sessionID: "s1", messageID: "m2", partID: "p1", sourceType: "part", excerpt: "part" },
      summaryText: "part content",
    };

    const result = selectEvidenceForBudget(
      [partItem, toolItem, userItem],
      10000,
      { preferDirectUser: true },
    );

    expect(result[0]!.evidenceID).toBe("tool_1");
    expect(result[1]!.evidenceID).toBe("user_1");
    expect(result[2]!.evidenceID).toBe("part_1");
  });
});
