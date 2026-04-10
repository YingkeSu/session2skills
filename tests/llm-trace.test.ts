import { describe, expect, it } from "vitest";

import { createTrace, applyTracePolicy, DEFAULT_TRACE_POLICY, generateTraceID } from "../src/llm/trace.js";
import type { LLMTrace } from "../src/llm/trace.js";

const minimalTrace: LLMTrace = {
  traceID: "trace_abc_12345678",
  timestamp: "2026-04-09T12:00:00.000Z",
  promptID: "enrich-profile",
  promptVersion: "1.0.0",
  provider: "openai",
  model: "gpt-4o",
  inputArtifactRef: "sessions/ses_abc",
  latencyMs: 1200,
  usage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
  parsedOutput: { workStyle: [{ kind: "work-style", value: "tdd", weight: 4, evidence: [] }] },
};

describe("LLMTrace", () => {
  it("includes minimum required provenance fields", () => {
    const trace = createTrace({
      promptID: "enrich-profile",
      promptVersion: "1.0.0",
      provider: "openai",
      model: "gpt-4o",
      inputArtifactRef: "sessions/ses_abc",
      latencyMs: 800,
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      parsedOutput: { test: true },
    });

    expect(trace.traceID).toMatch(/^trace_/);
    expect(trace.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(trace.promptID).toBe("enrich-profile");
    expect(trace.promptVersion).toBe("1.0.0");
    expect(trace.provider).toBe("openai");
    expect(trace.model).toBe("gpt-4o");
    expect(trace.inputArtifactRef).toBe("sessions/ses_abc");
    expect(trace.latencyMs).toBe(800);
    expect(trace.usage?.totalTokens).toBe(150);
    expect(trace.parsedOutput).toEqual({ test: true });
    expect(trace.rawOutput).toBeUndefined();
  });

  it("includes rawOutput when provided", () => {
    const trace = createTrace({
      promptID: "classify-signal",
      promptVersion: "1.0.0",
      provider: "anthropic",
      model: "claude-4-sonnet",
      inputArtifactRef: "session/ses_def",
      latencyMs: 500,
      usage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 },
      parsedOutput: { kind: "constraint" },
      rawOutput: '{"kind": "constraint"}',
    });

    expect(trace.rawOutput).toBe('{"kind": "constraint"}');
  });
});

describe("TracePolicy", () => {
  it("default policy persists metadata and parsedOutput but not rawOutput", () => {
    const result = applyTracePolicy(minimalTrace, DEFAULT_TRACE_POLICY);

    expect(result).not.toBeNull();
    expect(result!.parsedOutput).toEqual(minimalTrace.parsedOutput);
    expect(result!.rawOutput).toBeUndefined();
  });

  it("omits rawOutput by default even when present on trace", () => {
    const traceWithRaw: LLMTrace = {
      ...minimalTrace,
      rawOutput: "some very long raw text",
    };

    const result = applyTracePolicy(traceWithRaw, DEFAULT_TRACE_POLICY);

    expect(result!.rawOutput).toBeUndefined();
  });

  it("includes rawOutput when policy explicitly enables it", () => {
    const traceWithRaw: LLMTrace = {
      ...minimalTrace,
      rawOutput: "some very long raw text",
    };

    const result = applyTracePolicy(traceWithRaw, {
      ...DEFAULT_TRACE_POLICY,
      persistRawOutput: true,
    });

    expect(result!.rawOutput).toBe("some very long raw text");
  });

  it("returns null when metadata persistence is disabled", () => {
    const result = applyTracePolicy(minimalTrace, {
      persistMetadata: false,
      persistParsedOutput: true,
      persistRawOutput: false,
    });

    expect(result).toBeNull();
  });

  it("strips parsedOutput when that policy flag is off", () => {
    const result = applyTracePolicy(minimalTrace, {
      ...DEFAULT_TRACE_POLICY,
      persistParsedOutput: false,
    });

    expect(result!.parsedOutput).toBeUndefined();
  });
});

describe("generateTraceID", () => {
  it("produces unique IDs across calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateTraceID()));
    expect(ids.size).toBe(50);
  });
});
