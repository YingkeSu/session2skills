import { describe, expect, it } from "vitest";

import { createInMemoryLlmCache } from "../llm/cache.js";
import type { ResolvedLlmProvider } from "../llm/provider.js";
import type {
  LlmProvider,
  LlmStructuredGenerationRequest,
  LlmStructuredGenerationResult,
  LlmTextGenerationRequest,
  LlmTextGenerationResult,
} from "../llm/index.js";
import type {
  CandidateClaim,
  EvidenceItem,
  NormalizedSession,
} from "../normalize/models.js";
import { LlmProviderError } from "../shared/errors.js";
import {
  DEFAULT_EXTRACTION_BUDGET,
  extractSessionClaimsViaLLM,
  resetSessionClaimCounter,
} from "./llm-extractors.js";
import {
  DEFAULT_REDUCE_BUDGET,
  reduceCategoryClaimsViaLLM,
} from "./llm-reducers.js";

describe("LLM caching and fallback", () => {
  it("caches successful session extraction results", async () => {
    resetSessionClaimCounter();

    const calls = { count: 0 };
    const resolved = makeResolvedProvider(calls, async () => ({
      claims: [
        {
          dimension: "work-style",
          label: "iterative",
          confidence: 0.9,
          rationale: "The session repeatedly works in small steps.",
          evidenceIDs: ["e1"],
        },
      ],
    }));
    const cache = createInMemoryLlmCache();
    const session = makeSession();
    const evidence = [makeEvidence("e1", session.id)];

    const first = await extractSessionClaimsViaLLM(
      session,
      evidence,
      DEFAULT_EXTRACTION_BUDGET,
      resolved,
      undefined,
      cache,
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await extractSessionClaimsViaLLM(
      session,
      evidence,
      DEFAULT_EXTRACTION_BUDGET,
      resolved,
      undefined,
      cache,
    );

    expect(calls.count).toBe(1);
    expect(first.trace.cache?.hit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.trace.cache).toMatchObject({ hit: true });
    expect(second.claims).toEqual(first.claims);
    expect(second.trace.timestamp).not.toBe(first.trace.timestamp);
  });

  it("falls back safely on extraction timeout without caching the fallback", async () => {
    resetSessionClaimCounter();

    const calls = { count: 0 };
    const resolved = makeResolvedProvider(calls, async () => {
      throw new LlmProviderError("LLM request timed out after 50ms.", {
        provider: "stub",
        retryable: true,
      });
    });
    const cache = createInMemoryLlmCache();
    const session = makeSession();
    const evidence = [makeEvidence("e1", session.id)];

    const first = await extractSessionClaimsViaLLM(
      session,
      evidence,
      DEFAULT_EXTRACTION_BUDGET,
      resolved,
      undefined,
      cache,
    );
    const second = await extractSessionClaimsViaLLM(
      session,
      evidence,
      DEFAULT_EXTRACTION_BUDGET,
      resolved,
      undefined,
      cache,
    );

    expect(calls.count).toBe(2);
    expect(first.claims).toEqual([]);
    expect(first.error).toContain("timed out");
    expect(first.trace.response.finishReason).toBe("error");
    expect(first.trace.warnings?.[0]?.code).toBe("provider-timeout");
    expect(second.cacheHit).toBeUndefined();
  });

  it("caches successful category reduction results", async () => {
    const calls = { count: 0 };
    const provider = makeProvider(calls, async () => ({
      claims: [
        {
          dimension: "work-style",
          label: "iterative",
          confidence: 0.8,
          rationale: "Multiple sessions point to iterative work.",
          supportingEvidenceIDs: ["e1"],
        },
      ],
      conflicts: [],
      weakEvidenceAreas: [],
    }));
    const cache = createInMemoryLlmCache();
    const sourceClaims = [makeSourceClaim()];
    const evidence = [makeEvidence("e1", "session-1")];

    const first = await reduceCategoryClaimsViaLLM(
      sourceClaims,
      "work-style",
      evidence,
      DEFAULT_REDUCE_BUDGET,
      provider,
      { model: "stub-model" },
      undefined,
      cache,
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await reduceCategoryClaimsViaLLM(
      sourceClaims,
      "work-style",
      evidence,
      DEFAULT_REDUCE_BUDGET,
      provider,
      { model: "stub-model" },
      undefined,
      cache,
    );

    expect(calls.count).toBe(1);
    expect(first.trace.cache?.hit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.trace.cache).toMatchObject({ hit: true });
    expect(second.claims).toEqual(first.claims);
    expect(second.trace.timestamp).not.toBe(first.trace.timestamp);
  });

  it("falls back on malformed reduction output and leaves a parse warning trace", async () => {
    const calls = { count: 0 };
    const provider = makeProvider(calls, async () => {
      throw new LlmProviderError("LLM provider returned invalid JSON.", {
        provider: "stub",
      });
    });
    const cache = createInMemoryLlmCache();
    const sourceClaims = [makeSourceClaim()];
    const evidence = [makeEvidence("e1", "session-1")];

    const result = await reduceCategoryClaimsViaLLM(
      sourceClaims,
      "work-style",
      evidence,
      DEFAULT_REDUCE_BUDGET,
      provider,
      { model: "stub-model" },
      undefined,
      cache,
    );

    expect(result.fallback).toBe(true);
    expect(result.warning).toContain("invalid JSON");
    expect(result.trace.warnings?.[0]?.code).toBe("provider-malformed-output");
    expect(result.claims[0]?.claimID).toBe("claim:category-reduce:fallback:work-style:claim:source:1");
  });

  it("falls back on network reduction errors without caching the fallback", async () => {
    const calls = { count: 0 };
    const provider = makeProvider(calls, async () => {
      throw new LlmProviderError("LLM provider request failed: fetch failed", {
        provider: "stub",
        retryable: true,
        cause: new Error("fetch failed"),
      });
    });
    const cache = createInMemoryLlmCache();
    const sourceClaims = [makeSourceClaim()];
    const evidence = [makeEvidence("e1", "session-1")];

    const first = await reduceCategoryClaimsViaLLM(
      sourceClaims,
      "work-style",
      evidence,
      DEFAULT_REDUCE_BUDGET,
      provider,
      { model: "stub-model" },
      undefined,
      cache,
    );
    const second = await reduceCategoryClaimsViaLLM(
      sourceClaims,
      "work-style",
      evidence,
      DEFAULT_REDUCE_BUDGET,
      provider,
      { model: "stub-model" },
      undefined,
      cache,
    );

    expect(calls.count).toBe(2);
    expect(first.fallback).toBe(true);
    expect(first.trace.warnings?.[0]?.code).toBe("provider-connection-error");
    expect(second.cacheHit).toBeUndefined();
  });
});

function makeResolvedProvider(
  calls: { count: number },
  handler: <T>(request: LlmStructuredGenerationRequest<T>) => Promise<unknown>,
): ResolvedLlmProvider {
  return {
    provider: makeProvider(calls, handler),
    model: { model: "stub-model" },
  };
}

function makeProvider(
  calls: { count: number },
  handler: <T>(request: LlmStructuredGenerationRequest<T>) => Promise<unknown>,
): LlmProvider {
  return {
    provider: "stub",
    listModels: () => [],
    async generateText(_request: LlmTextGenerationRequest): Promise<LlmTextGenerationResult> {
      throw new Error("not implemented");
    },
    async generateStructured<T>(
      request: LlmStructuredGenerationRequest<T>,
    ): Promise<LlmStructuredGenerationResult<T>> {
      calls.count += 1;
      const payload = await handler(request);
      return {
        object: request.schema.parse(payload),
        rawText: JSON.stringify(payload),
        finishReason: "stop",
        metadata: {
          provider: "stub",
          model: "stub-model",
          latencyMs: 1,
          attempts: 1,
        },
      };
    },
  };
}

function makeSession(): NormalizedSession {
  return {
    id: "session-1",
    title: "Cache test session",
    directory: "/tmp/project",
    updatedAt: 1,
    summaryText: "Investigate before editing and validate incrementally.",
    diffSummary: {
      filesChanged: 1,
      additions: 10,
      deletions: 2,
      files: ["src/example.ts"],
    },
    messages: [],
    toolInvocations: [],
    steps: [],
  };
}

function makeEvidence(evidenceID: string, sessionID: string): EvidenceItem {
  return {
    schemaVersion: "evidence-item/v1",
    evidenceID,
    citation: {
      evidenceID,
      sessionID,
      sourceType: "message",
      excerpt: "Inspect first, then make small verified edits.",
    },
    summaryText: "The developer inspects code first and iterates in small verified steps.",
    dimensions: ["work-style", "validation-habit"],
  };
}

function makeSourceClaim(): CandidateClaim<"work-style"> {
  const evidence = makeEvidence("e1", "session-1");
  return {
    schemaVersion: "candidate-claim/v1",
    claimID: "claim:source:1",
    dimension: "work-style",
    label: "iterative",
    confidence: 0.8,
    rationale: "Observed iterative edits.",
    citations: [evidence.citation],
    source: {
      type: "rule",
      ruleID: "rule:test",
    },
  };
}
