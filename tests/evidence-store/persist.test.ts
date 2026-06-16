import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { EvidenceStore } from "../../src/evidence-store/store.js";
import { persistRawEvidence } from "../../src/evidence-store/persist.js";
import { buildEvidenceIndex, makeEvidenceID, makeExcerpt } from "../../src/harness/evidence-index.js";
import { buildSessions, type SessionSpec } from "../fixtures/evidence-store-fixtures.js";

const LONG_BODY = `Secret token sk-abcdefghijklmnopqrstuvwxyz1234567890 follows. ${"Line of evidence text. ".repeat(60)}`;

const SESSIONS_SPEC: Array<SessionSpec> = [
  {
    id: "ses_a",
    messages: [
      {
        id: "msg_a1",
        text: "hello world",
        parts: [
          { id: "part_a1", text: "part body text" },
          { id: "part_a2", toolName: "read" },
          { id: "part_a3", title: "A title only" },
        ],
      },
      { id: "msg_a2", text: "   " },
    ],
  },
  {
    id: "ses_b",
    messages: [{ id: "msg_b1", text: "x" }],
    tools: [
      { id: "tool_b1", toolName: "edit", title: "Edit file", output: "ok", input: { path: "a.ts" } },
      { id: "tool_b2", toolName: "bash", output: "done" },
    ],
  },
];

describe("persistRawEvidence", () => {
  let dir: string;
  let store: EvidenceStore;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "ev-persist-"));
    store = new EvidenceStore(path.join(dir, "evidence-store.db"));
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes the expected number of records and reports skipped", () => {
    const sessions = buildSessions(SESSIONS_SPEC);
    const result = persistRawEvidence(sessions, store);

    expect(result.written).toBe(6);
    expect(result.skipped).toBe(2);
    expect(store.count()).toBe(6);
  });

  it("produces evidenceIDs that exactly align with buildEvidenceIndex", () => {
    const sessions = buildSessions(SESSIONS_SPEC);
    persistRawEvidence(sessions, store);

    const index = buildEvidenceIndex(sessions);
    expect(index).toHaveLength(6);

    for (const item of index) {
      const record = store.getRecord(item.evidenceID);
      expect(record, `missing record for ${item.evidenceID}`).not.toBeNull();
      expect(record?.excerpt).toBe(item.summaryText);
    }

    expect(store.count()).toBe(index.length);
  });

  it("stores the expected canonical evidenceIDs", () => {
    const sessions = buildSessions(SESSIONS_SPEC);
    persistRawEvidence(sessions, store);

    const expected = [
      makeEvidenceID("ses_a", "msg_a1"),
      makeEvidenceID("ses_a", "msg_a1", "part_a1"),
      makeEvidenceID("ses_a", "msg_a1", "part_a3"),
      makeEvidenceID("ses_b", "msg_b1"),
      makeEvidenceID("ses_b", "tool_b1"),
      makeEvidenceID("ses_b", "tool_b2"),
    ];

    for (const id of expected) {
      expect(store.getRecord(id), `missing ${id}`).not.toBeNull();
    }
  });

  it("getRawMessage returns the full (untruncated) redacted text", () => {
    const sessions = buildSessions([
      { id: "ses_long", messages: [{ id: "msg_long", text: LONG_BODY }] },
    ]);
    persistRawEvidence(sessions, store);

    const record = store.getRecord(makeEvidenceID("ses_long", "msg_long"));
    expect(record).not.toBeNull();

    const fullRedacted = record!.rawText;
    expect(fullRedacted.length).toBeGreaterThan(600);
    expect(fullRedacted).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(fullRedacted).toContain("[REDACTED_SECRET]");

    expect(store.getRawMessage("ses_long", "msg_long")).toBe(fullRedacted);
    expect(record!.excerpt).toBe(makeExcerpt(LONG_BODY));
    expect(record!.excerpt.length).toBeLessThan(fullRedacted.length);
    expect(record!.redacted).toBe(true);
  });

  it("skips empty messages and parts without content", () => {
    const sessions = buildSessions([
      {
        id: "ses_empty",
        messages: [
          { id: "m1", text: "", parts: [{ id: "p1" }, { id: "p2", text: "   " }] },
          { id: "m2", text: "kept" },
        ],
      },
    ]);
    const result = persistRawEvidence(sessions, store);

    expect(result.written).toBe(1);
    expect(result.skipped).toBe(3);
    expect(store.has("ses_empty")).toBe(true);
  });

  it("assigns sourceType 'part' to text parts and 'tool' to tool parts", () => {
    const sessions = buildSessions([
      {
        id: "ses_types",
        messages: [
          {
            id: "m1",
            text: "msg",
            parts: [
              { id: "text_part", text: "plain" },
              { id: "tool_part", toolName: "read", text: "toolish", title: "Read" },
            ],
          },
        ],
      },
    ]);
    persistRawEvidence(sessions, store);

    expect(store.getRecord("ses_types:m1:text_part")?.sourceType).toBe("part");
    expect(store.getRecord("ses_types:m1:tool_part")?.sourceType).toBe("tool");
  });

  it("stores tool raw text with full output and input", () => {
    const sessions = buildSessions([
      {
        id: "ses_t",
        tools: [
          {
            id: "tool_t1",
            toolName: "edit",
            title: "Edit file",
            input: { apiKey: "sk-secretvalue123456", path: "a.ts" },
            output: "applied the patch",
          },
        ],
      },
    ]);
    persistRawEvidence(sessions, store);

    const record = store.getRecord(makeEvidenceID("ses_t", "tool_t1"));
    expect(record?.sourceType).toBe("tool");
    expect(record?.rawText).toContain("Tool: edit — Edit file");
    expect(record?.rawText).toContain("applied the patch");
    expect(record?.rawText).not.toContain("sk-secretvalue123456");
    expect(record?.rawText).toContain("[REDACTED_SECRET]");
  });

  it("handles an empty session list", () => {
    const result = persistRawEvidence([], store);
    expect(result).toEqual({ written: 0, skipped: 0 });
    expect(store.count()).toBe(0);
  });
});
