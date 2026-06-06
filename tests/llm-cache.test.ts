import { describe, expect, it } from "vitest";

import { clearDefaultLlmCache, createInMemoryLlmCache, getDefaultLlmCache } from "../src/llm/cache.js";
import type { CandidateClaim, LLMTrace } from "../src/normalize/models.js";

function makeTestClaim(id: string): CandidateClaim {
  return {
    schemaVersion: "candidate-claim/v1" as const,
    claimID: `claim:test:${id}`,
    dimension: "work-style" as const,
    label: "analysis-first" as const,
    confidence: 0.8,
    rationale: "test",
    citations: [],
    source: { type: "rule" as const, ruleID: "test/rule" },
  };
}

function makeTestTrace(id: string): LLMTrace {
  return {
    schemaVersion: "llm-trace/v1",
    traceID: `trace:${id}`,
    timestamp: new Date().toISOString(),
    promptSetVersion: "prompt-set/v1",
    stage: "session-claims",
    provider: "test",
    model: "test",
    request: {
      promptName: "test",
      messages: [],
    },
    response: {
      finishReason: "stop",
      rawText: "{}",
      structuredOutput: { kind: "candidate-claims", claims: [] },
    },
  };
}

function makeTestValue(id: string) {
  return {
    claims: [makeTestClaim(id)],
    traces: [makeTestTrace(id)],
    timestamp: new Date().toISOString(),
  };
}

describe("InMemoryLlmCache", () => {
  it("stores and retrieves values", () => {
    const cache = createInMemoryLlmCache();
    const value = makeTestValue("1");
    cache.set("key1", value);
    const retrieved = cache.get("key1");
    expect(retrieved).toBeDefined();
    expect(retrieved!.claims[0].claimID).toBe("claim:test:1");
  });

  it("returns undefined for missing keys", () => {
    const cache = createInMemoryLlmCache();
    expect(cache.get("missing")).toBeUndefined();
  });

  it("returns a clone (not the same reference)", () => {
    const cache = createInMemoryLlmCache();
    const value = makeTestValue("1");
    cache.set("key1", value);
    const retrieved = cache.get("key1");
    expect(retrieved).not.toBe(value);
    expect(retrieved!.claims).not.toBe(value.claims);
  });

  it("expires entries after TTL", () => {
    const cache = createInMemoryLlmCache({ ttlMs: 1 });
    const value = makeTestValue("1");
    value.timestamp = new Date(Date.now() - 1000).toISOString();
    cache.set("key1", value);
    expect(cache.get("key1")).toBeUndefined();
  });

  it("evicts oldest entries when maxEntries is exceeded", () => {
    const cache = createInMemoryLlmCache({ maxEntries: 2 });
    cache.set("key1", makeTestValue("1"));
    cache.set("key2", makeTestValue("2"));
    cache.set("key3", makeTestValue("3"));
    expect(cache.get("key1")).toBeUndefined();
    expect(cache.get("key2")).toBeDefined();
    expect(cache.get("key3")).toBeDefined();
  });

  it("produces stable hashes for same input", () => {
    const cache = createInMemoryLlmCache();
    const input = { a: 1, b: [2, 3] };
    expect(cache.hash(input)).toBe(cache.hash(input));
  });

  it("produces different hashes for different input", () => {
    const cache = createInMemoryLlmCache();
    expect(cache.hash({ a: 1 })).not.toBe(cache.hash({ a: 2 }));
  });

  it("handles invalid timestamps as expired", () => {
    const cache = createInMemoryLlmCache({ ttlMs: 60000 });
    const value = makeTestValue("1");
    value.timestamp = "not-a-date";
    cache.set("key1", value);
    expect(cache.get("key1")).toBeUndefined();
  });
});

describe("getDefaultLlmCache / clearDefaultLlmCache", () => {
  it("shares the default cache instance", () => {
    clearDefaultLlmCache();
    const cache1 = getDefaultLlmCache();
    cache1.set("shared", makeTestValue("shared"));
    const cache2 = getDefaultLlmCache();
    expect(cache2.get("shared")).toBeDefined();
    clearDefaultLlmCache();
  });

  it("clears the default cache", () => {
    const cache = getDefaultLlmCache();
    cache.set("before-clear", makeTestValue("1"));
    clearDefaultLlmCache();
    expect(getDefaultLlmCache().get("before-clear")).toBeUndefined();
  });
});
