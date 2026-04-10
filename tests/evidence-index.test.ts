import { describe, it, expect } from "vitest";
import {
  buildEvidenceIndex,
  makeEvidenceID,
  makeExcerpt,
  estimateTokens,
  selectEvidenceForBudget,
  buildCategoryPacket,
  isDirectUserEvidence,
  groupByDimension,
} from "../src/analyze/evidence-index.js";
import type { NormalizedSession, EvidenceItem } from "../src/normalize/models.js";

const makeSession = (overrides: Partial<NormalizedSession> = {}): NormalizedSession => ({
  id: "ses_test",
  title: "Test session",
  directory: "/tmp/test",
  updatedAt: 1,
  messages: [],
  toolInvocations: [],
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

  it("tags user messages with communication-style dimension", () => {
    const session = makeSession({
      messages: [makeUserMessage("msg_1", "Can you explain how this works?")],
    });

    const index = buildEvidenceIndex([session]);
    const userItem = index.find((e) => e.evidenceID === "ses_test:msg_1");
    expect(userItem?.dimensions).toContain("communication-style");
  });

  it("tags constraint language with constraint dimension", () => {
    const session = makeSession({
      messages: [makeUserMessage("msg_1", "Please use minimal diff and preserve existing patterns")],
    });

    const index = buildEvidenceIndex([session]);
    const item = index.find((e) => e.evidenceID === "ses_test:msg_1");
    expect(item?.dimensions).toContain("constraint");
  });

  it("tags validation tools with validation-habit dimension", () => {
    const session = makeSession({
      toolInvocations: [
        {
          id: "tool_diag",
          toolName: "lsp_diagnostics",
          status: "completed",
          evidence: {
            sessionID: "ses_test",
            sourceType: "tool" as const,
            excerpt: "diagnostics",
          },
        },
      ],
    });

    const index = buildEvidenceIndex([session]);
    const toolItem = index.find((e) => e.evidenceID === "ses_test:tool_diag");
    expect(toolItem?.dimensions).toContain("validation-habit");
  });

  it("tags bash-style validation commands from tool input and output", () => {
    const session = makeSession({
      toolInvocations: [
        {
          id: "tool_bash",
          toolName: "bash",
          status: "completed",
          input: {
            command: "npm run test && git status",
          },
          output: "typecheck complete",
          evidence: {
            sessionID: "ses_test",
            sourceType: "tool" as const,
            excerpt: "npm run test && git status",
          },
        },
      ],
    });

    const index = buildEvidenceIndex([session]);
    const toolItem = index.find((e) => e.evidenceID === "ses_test:tool_bash");
    expect(toolItem?.dimensions).toContain("validation-habit");
  });

  it("tags tool invocations with work-style dimension", () => {
    const session = makeSession({
      toolInvocations: [
        {
          id: "tool_read",
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
    const toolItem = index.find((e) => e.evidenceID === "ses_test:tool_read");
    expect(toolItem?.dimensions).toContain("work-style");
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
      dimensions: ["communication-style"],
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
      dimensions: [],
    };

    expect(isDirectUserEvidence(item)).toBe(false);
  });

  it("returns false for tool evidence", () => {
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
      dimensions: ["work-style"],
    };

    expect(isDirectUserEvidence(item)).toBe(false);
  });
});

describe("selectEvidenceForBudget", () => {
  it("filters by dimension", () => {
    const items: Array<EvidenceItem> = [
      {
        schemaVersion: "evidence-item/v1",
        evidenceID: "e1",
        citation: { evidenceID: "e1", sessionID: "s1", sourceType: "message", excerpt: "a" },
        summaryText: "a",
        dimensions: ["communication-style"],
      },
      {
        schemaVersion: "evidence-item/v1",
        evidenceID: "e2",
        citation: { evidenceID: "e2", sessionID: "s1", sourceType: "tool", excerpt: "b" },
        summaryText: "b",
        dimensions: ["work-style"],
      },
    ];

    const result = selectEvidenceForBudget(items, 1000, { dimensions: ["work-style"] });
    expect(result).toHaveLength(1);
    expect(result[0].evidenceID).toBe("e2");
  });

  it("respects token budget", () => {
    const items: Array<EvidenceItem> = Array.from({ length: 20 }, (_, i) => ({
      schemaVersion: "evidence-item/v1" as const,
      evidenceID: `e_${i}`,
      citation: { evidenceID: `e_${i}`, sessionID: "s1", sourceType: "message" as const, excerpt: `${i}` },
      summaryText: `${i} `.repeat(50).trim(),
      dimensions: ["work-style" as const],
    }));

    const result = selectEvidenceForBudget(items, 200, { maxItems: 100 });
    const totalTokens = result.reduce((sum, item) => sum + estimateTokens(item.summaryText), 0);
    expect(totalTokens).toBeLessThanOrEqual(200);
  });

  it("prioritizes direct-user evidence when preferDirectUser is true", () => {
    const toolItem: EvidenceItem = {
      schemaVersion: "evidence-item/v1",
      evidenceID: "tool_first",
      citation: { evidenceID: "tool_first", sessionID: "s1", sourceType: "tool", excerpt: "tool" },
      summaryText: "tool output",
      dimensions: ["work-style"],
    };
    const userItem: EvidenceItem = {
      schemaVersion: "evidence-item/v1",
      evidenceID: "user_first",
      citation: { evidenceID: "user_first", sessionID: "s1", messageID: "m1", sourceType: "message", excerpt: "user" },
      summaryText: "user instruction",
      dimensions: ["work-style"],
    };

    const result = selectEvidenceForBudget(
      [toolItem, userItem],
      10000,
      { preferDirectUser: true },
    );

    expect(result[0].evidenceID).toBe("user_first");
  });

  it("deduplicates by evidenceID", () => {
    const item: EvidenceItem = {
      schemaVersion: "evidence-item/v1",
      evidenceID: "dup_1",
      citation: { evidenceID: "dup_1", sessionID: "s1", sourceType: "message", excerpt: "a" },
      summaryText: "a",
      dimensions: ["work-style"],
    };

    const result = selectEvidenceForBudget([item, item, item], 10000);
    expect(result).toHaveLength(1);
  });
});

describe("buildCategoryPacket", () => {
  it("builds formatted text block for a dimension", () => {
    const items: Array<EvidenceItem> = [
      {
        schemaVersion: "evidence-item/v1",
        evidenceID: "e1",
        citation: { evidenceID: "e1", sessionID: "s1", messageID: "m1", sourceType: "message", excerpt: "test" },
        summaryText: "User asked for analysis",
        dimensions: ["communication-style"],
      },
    ];

    const packet = buildCategoryPacket(items, "communication-style", 1000);
    expect(packet).toContain("## Evidence for communication-style");
    expect(packet).toContain("[e1]");
    expect(packet).toContain("User asked for analysis");
  });

  it("prefers direct user evidence before tool evidence in packets", () => {
    const items: Array<EvidenceItem> = [
      {
        schemaVersion: "evidence-item/v1",
        evidenceID: "tool_1",
        citation: { evidenceID: "tool_1", sessionID: "s1", sourceType: "tool", excerpt: "tool" },
        summaryText: "Ran diagnostics after editing",
        dimensions: ["validation-habit"],
      },
      {
        schemaVersion: "evidence-item/v1",
        evidenceID: "user_1",
        citation: { evidenceID: "user_1", sessionID: "s1", messageID: "m1", sourceType: "message", excerpt: "user" },
        summaryText: "Please run diagnostics before you finish",
        dimensions: ["validation-habit"],
      },
    ];

    const packet = buildCategoryPacket(items, "validation-habit", 1000);
    expect(packet.indexOf("[user_1]")).toBeLessThan(packet.indexOf("[tool_1]"));
  });

  it("returns fallback message when no evidence matches", () => {
    const items: Array<EvidenceItem> = [
      {
        schemaVersion: "evidence-item/v1",
        evidenceID: "e1",
        citation: { evidenceID: "e1", sessionID: "s1", sourceType: "message", excerpt: "a" },
        summaryText: "a",
        dimensions: ["work-style"],
      },
    ];

    const packet = buildCategoryPacket(items, "constraint", 1000);
    expect(packet).toContain("No evidence for dimension: constraint");
  });
});

describe("groupByDimension", () => {
  it("groups items into all four dimension buckets", () => {
    const items: Array<EvidenceItem> = [
      {
        schemaVersion: "evidence-item/v1",
        evidenceID: "e1",
        citation: { evidenceID: "e1", sessionID: "s1", sourceType: "message", excerpt: "a" },
        summaryText: "a",
        dimensions: ["work-style", "constraint"],
      },
      {
        schemaVersion: "evidence-item/v1",
        evidenceID: "e2",
        citation: { evidenceID: "e2", sessionID: "s1", sourceType: "message", excerpt: "b" },
        summaryText: "b",
        dimensions: ["communication-style"],
      },
    ];

    const groups = groupByDimension(items);
    expect(groups["work-style"]).toHaveLength(1);
    expect(groups["constraint"]).toHaveLength(1);
    expect(groups["communication-style"]).toHaveLength(1);
    expect(groups["validation-habit"]).toHaveLength(0);
  });
});
