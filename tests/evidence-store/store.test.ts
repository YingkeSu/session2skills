import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { EvidenceStore } from "../../src/evidence-store/store.js";
import type { EvidenceRecord } from "../../src/evidence-store/types.js";

function tempDbPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ev-store-"));
  return path.join(dir, "evidence-store.db");
}

function sampleRecord(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    evidenceID: "ses_1:msg_1",
    sessionID: "ses_1",
    messageID: "msg_1",
    sourceType: "message",
    rawText: "full raw message text",
    excerpt: "full raw...",
    redacted: true,
    createdAt: 1700000000000,
    ...overrides,
  };
}

describe("EvidenceStore", () => {
  let dbPath: string;
  let store: EvidenceStore;

  beforeEach(() => {
    dbPath = tempDbPath();
    store = new EvidenceStore(dbPath);
  });

  afterEach(() => {
    store.close();
    rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  it("persists a record and returns it via getRecord", () => {
    const record = sampleRecord();
    store.put(record);

    const got = store.getRecord("ses_1:msg_1");
    expect(got).not.toBeNull();
    expect(got).toEqual(record);
  });

  it("getExcerpt returns the excerpt", () => {
    store.put(sampleRecord({ excerpt: "the excerpt text" }));

    expect(store.getExcerpt("ses_1:msg_1")).toBe("the excerpt text");
  });

  it("getExcerpt returns null for a missing id", () => {
    expect(store.getExcerpt("does:not:exist")).toBeNull();
  });

  it("getRecord returns null for a missing id", () => {
    expect(store.getRecord("does:not:exist")).toBeNull();
  });

  it("getRawMessage finds a message-type record and returns its rawText", () => {
    store.put(sampleRecord({ rawText: "the full raw text" }));

    expect(store.getRawMessage("ses_1", "msg_1")).toBe("the full raw text");
  });

  it("getRawMessage returns null when only a part-type record matches the messageID", () => {
    store.put(
      sampleRecord({
        evidenceID: "ses_1:msg_1:part_1",
        partID: "part_1",
        sourceType: "part",
        rawText: "part text",
      }),
    );

    expect(store.getRawMessage("ses_1", "msg_1")).toBeNull();
  });

  it("getRawMessage returns null for a missing session/message", () => {
    expect(store.getRawMessage("ses_1", "missing")).toBeNull();
  });

  it("upserts: putting the same evidenceID twice updates the row", () => {
    store.put(sampleRecord({ rawText: "first" }));
    store.put(sampleRecord({ rawText: "second" }));

    expect(store.count()).toBe(1);
    expect(store.getRecord("ses_1:msg_1")?.rawText).toBe("second");
  });

  it("count returns the number of stored records", () => {
    store.put(sampleRecord({ evidenceID: "ses_1:msg_1" }));
    store.put(sampleRecord({ evidenceID: "ses_1:msg_2", messageID: "msg_2" }));
    store.put(sampleRecord({ evidenceID: "ses_2:msg_1", sessionID: "ses_2" }));

    expect(store.count()).toBe(3);
  });

  it("has returns true when any record exists for the session", () => {
    store.put(sampleRecord({ evidenceID: "ses_1:msg_1", sessionID: "ses_1" }));
    store.put(sampleRecord({ evidenceID: "ses_2:p1", sessionID: "ses_2", partID: "p1", sourceType: "part" }));

    expect(store.has("ses_1")).toBe(true);
    expect(store.has("ses_2")).toBe(true);
    expect(store.has("ses_absent")).toBe(false);
  });

  it("persists optional messageID/partID as undefined when not provided", () => {
    store.put(
      sampleRecord({
        evidenceID: "ses_3",
        sessionID: "ses_3",
        sourceType: "message",
        messageID: undefined,
        partID: undefined,
      }),
    );

    const got = store.getRecord("ses_3");
    expect(got?.messageID).toBeUndefined();
    expect(got?.partID).toBeUndefined();
  });

  it("commits all writes when wrapped in a transaction", () => {
    store.transaction(() => {
      store.put(sampleRecord({ evidenceID: "a", messageID: undefined }));
      store.put(sampleRecord({ evidenceID: "b", messageID: undefined }));
    });

    expect(store.count()).toBe(2);
  });

  it("rolls back a transaction that throws", () => {
    expect(() =>
      store.transaction(() => {
        store.put(sampleRecord({ evidenceID: "a", messageID: undefined }));
        throw new Error("boom");
      }),
    ).toThrow("boom");

    expect(store.count()).toBe(0);
  });

  it("creates the parent .session2skills directory when it does not exist", () => {
    const nested = path.join(path.dirname(dbPath), "deep", "nested", "evidence-store.db");
    const nestedStore = new EvidenceStore(nested);
    try {
      nestedStore.put(sampleRecord());
      expect(nestedStore.count()).toBe(1);
    } finally {
      nestedStore.close();
    }
  });

  describe("after close", () => {
    it("operations throw because the underlying statement is finalized", () => {
      const record = sampleRecord();
      store.put(record);
      store.close();

      expect(() => store.getRecord(record.evidenceID)).toThrow();
      expect(() => store.count()).toThrow();
      expect(() => store.put(record)).toThrow();
    });

    it("close is idempotent", () => {
      expect(() => store.close()).not.toThrow();
      expect(() => store.close()).not.toThrow();
    });
  });
});

describe("EvidenceStore reopen", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ev-store-reopen-"));
  const dbPath = path.join(dir, "evidence-store.db");

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("retains records across store instances (persisted to disk)", () => {
    const first = new EvidenceStore(dbPath);
    first.put(sampleRecord({ evidenceID: "persisted:1", sessionID: "persisted", messageID: "1" }));
    first.close();

    const second = new EvidenceStore(dbPath);
    try {
      expect(second.count()).toBe(1);
      expect(second.getRecord("persisted:1")?.rawText).toBe("full raw message text");
    } finally {
      second.close();
    }
  });
});
