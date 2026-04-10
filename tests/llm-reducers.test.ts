import { describe, expect, it, vi } from "vitest";

import {
  reduceCategoryClaimsViaLLM,
  reduceAllCategories,
  DEFAULT_REDUCE_BUDGET,
} from "../src/analyze/llm-reducers.js";
import type { ReduceBudget } from "../src/analyze/llm-reducers.js";
import type {
  CandidateClaim,
  EvidenceItem,
} from "../src/normalize/models.js";
import type { LlmProvider } from "../src/llm/provider.js";
import type {
  LlmStructuredGenerationResult,
  LlmGenerationMetadata,
} from "../src/llm/types.js";

function makeEvidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  const id = overrides.evidenceID ?? "ev_001";
  return {
    schemaVersion: "evidence-item/v1",
    evidenceID: id,
    citation: {
      evidenceID: id,
      sessionID: overrides.citation?.sessionID ?? "ses_001",
      sourceType: overrides.citation?.sourceType ?? "message",
      excerpt: overrides.citation?.excerpt ?? "User asked to use minimal diff",
    },
    summaryText: overrides.summaryText ?? "User asked to use minimal diff",
    dimensions: overrides.dimensions ?? ["constraint"],
  };
}

function makeClaim(overrides: Partial<CandidateClaim<"constraint">> = {}): CandidateClaim<"constraint"> {
  return {
    schemaVersion: "candidate-claim/v1",
    claimID: "claim:rule:1",
    dimension: "constraint",
    label: "minimal-diff",
    confidence: 0.8,
    rationale: "User frequently asks for minimal changes",
    citations: [
      {
        evidenceID: "ev_001",
        sessionID: "ses_001",
        sourceType: "message",
      },
    ],
    source: { type: "rule", ruleID: "extract-constraints/minimal-diff" },
    ...overrides,
  };
}

function makeLlmProvider(
  response: LlmStructuredGenerationResult<unknown>,
): LlmProvider {
  return {
    provider: "test",
    defaultModel: { model: "test-model" },
    listModels: () => [],
    generateText: async () => {
      throw new Error("not implemented");
    },
    generateStructured: async <T>() => {
      return response as unknown as LlmStructuredGenerationResult<T>;
    },
  };
}

function makeMetadata(): LlmGenerationMetadata {
  return {
    provider: "test",
    model: "test-model",
    latencyMs: 100,
    attempts: 1,
  };
}

const budget: ReduceBudget = {
  tokenBudget: 8000,
  timeoutMs: 5000,
  temperature: 0.2,
};

describe("reduceCategoryClaimsViaLLM", () => {
  it("synthesizes claims and validates evidence IDs", async () => {
    const evidence = [
      makeEvidence({ evidenceID: "ev_001", dimensions: ["constraint"] }),
      makeEvidence({ evidenceID: "ev_002", dimensions: ["constraint"], summaryText: "Second evidence" }),
    ];
    const claims = [
      makeClaim({ claimID: "claim:1" }),
      makeClaim({ claimID: "claim:2", label: "preserve-patterns", confidence: 0.7 }),
    ];

    const provider = makeLlmProvider({
      object: {
        claims: [
          {
            dimension: "constraint",
            label: "minimal-diff",
            confidence: 0.85,
            rationale: "Strong convergence across sessions",
            supportingEvidenceIDs: ["ev_001", "ev_002"],
          },
        ],
      },
      rawText: '{"claims":[]}',
      metadata: makeMetadata(),
    });

    const result = await reduceCategoryClaimsViaLLM(
      claims,
      "constraint",
      evidence,
      budget,
      provider,
    );

    expect(result.fallback).toBe(false);
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]!.label).toBe("minimal-diff");
    expect(result.claims[0]!.confidence).toBeCloseTo(0.85);
    expect(result.claims[0]!.citations).toHaveLength(2);
    expect(result.claims[0]!.citations.map((c) => c.evidenceID)).toEqual([
      "ev_001",
      "ev_002",
    ]);
    expect(result.claims[0]!.source.type).toBe("llm-category");
  });

  it("drops claims with invalid evidence IDs", async () => {
    const evidence = [makeEvidence({ evidenceID: "ev_001" })];
    const claims = [makeClaim()];

    const provider = makeLlmProvider({
      object: {
        claims: [
          {
            dimension: "constraint",
            label: "minimal-diff",
            confidence: 0.9,
            rationale: "Strong",
            supportingEvidenceIDs: ["ev_INVENTED"],
          },
          {
            dimension: "constraint",
            label: "type-safety",
            confidence: 0.6,
            rationale: "Weak",
            supportingEvidenceIDs: ["ev_001"],
          },
        ],
      },
      rawText: "{}",
      metadata: makeMetadata(),
    });

    const result = await reduceCategoryClaimsViaLLM(
      claims,
      "constraint",
      evidence,
      budget,
      provider,
    );

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]!.label).toBe("type-safety");
  });

  it("drops claims with zero supporting evidence IDs", async () => {
    const evidence = [makeEvidence({ evidenceID: "ev_001" })];
    const claims = [makeClaim()];

    const provider = makeLlmProvider({
      object: {
        claims: [
          {
            dimension: "constraint",
            label: "minimal-diff",
            confidence: 0.9,
            rationale: "No evidence",
            supportingEvidenceIDs: [],
          },
        ],
      },
      rawText: "{}",
      metadata: makeMetadata(),
    });

    const result = await reduceCategoryClaimsViaLLM(
      claims,
      "constraint",
      evidence,
      budget,
      provider,
    );

    expect(result.claims).toHaveLength(0);
  });

  it("drops claims for wrong dimension", async () => {
    const evidence = [makeEvidence({ evidenceID: "ev_001" })];
    const claims = [makeClaim()];

    const provider = makeLlmProvider({
      object: {
        claims: [
          {
            dimension: "work-style",
            label: "iterative",
            confidence: 0.8,
            rationale: "Wrong dimension",
            supportingEvidenceIDs: ["ev_001"],
          },
        ],
      },
      rawText: "{}",
      metadata: makeMetadata(),
    });

    const result = await reduceCategoryClaimsViaLLM(
      claims,
      "constraint",
      evidence,
      budget,
      provider,
    );

    expect(result.claims).toHaveLength(0);
  });

  it("surfaces conflicts from LLM output", async () => {
    const evidence = [
      makeEvidence({ evidenceID: "ev_001" }),
      makeEvidence({ evidenceID: "ev_002" }),
      makeEvidence({ evidenceID: "ev_003" }),
    ];
    const claims = [makeClaim()];

    const provider = makeLlmProvider({
      object: {
        claims: [
          {
            dimension: "constraint",
            label: "minimal-diff",
            confidence: 0.7,
            rationale: "Partial support",
            supportingEvidenceIDs: ["ev_001"],
          },
        ],
        conflicts: [
          {
            description: "User sometimes asks for large refactors contradicting minimal-diff",
            sideA: ["ev_001"],
            sideB: ["ev_002", "ev_003"],
            severity: 0.6,
          },
        ],
      },
      rawText: "{}",
      metadata: makeMetadata(),
    });

    const result = await reduceCategoryClaimsViaLLM(
      claims,
      "constraint",
      evidence,
      budget,
      provider,
    );

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.description).toContain("contradicting");
    expect(result.conflicts[0]!.sideA).toEqual(["ev_001"]);
    expect(result.conflicts[0]!.sideB).toEqual(["ev_002", "ev_003"]);
    expect(result.conflicts[0]!.severity).toBeCloseTo(0.6);
  });

  it("falls back on LLM error with degraded confidence", async () => {
    const evidence = [makeEvidence({ evidenceID: "ev_001" })];
    const claims = [
      makeClaim({ confidence: 0.8, rationale: "Original rationale" }),
    ];

    const provider: LlmProvider = {
      provider: "test",
      defaultModel: { model: "test-model" },
      listModels: () => [],
      generateText: async () => {
        throw new Error("not implemented");
      },
      generateStructured: async () => {
        throw new Error("LLM timeout");
      },
    };

    const result = await reduceCategoryClaimsViaLLM(
      claims,
      "constraint",
      evidence,
      budget,
      provider,
    );

    expect(result.fallback).toBe(true);
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]!.confidence).toBeLessThanOrEqual(0.5);
    expect(result.claims[0]!.rationale).toContain("FALLBACK");
    expect(result.claims[0]!.rationale).toContain("LLM timeout");
    expect(result.weakEvidenceAreas).toHaveLength(1);
    expect(result.weakEvidenceAreas[0]!.dimension).toBe("constraint");
  });

  it("clamps confidence to [0, 1]", async () => {
    const evidence = [makeEvidence({ evidenceID: "ev_001" })];
    const claims = [makeClaim()];

    const provider = makeLlmProvider({
      object: {
        claims: [
          {
            dimension: "constraint",
            label: "minimal-diff",
            confidence: 1.5,
            rationale: "Overconfident",
            supportingEvidenceIDs: ["ev_001"],
          },
        ],
      },
      rawText: "{}",
      metadata: makeMetadata(),
    });

    const result = await reduceCategoryClaimsViaLLM(
      claims,
      "constraint",
      evidence,
      budget,
      provider,
    );

    expect(result.claims[0]!.confidence).toBe(1);
  });

  it("clamps negative confidence to 0", async () => {
    const evidence = [makeEvidence({ evidenceID: "ev_001" })];
    const claims = [makeClaim()];

    const provider = makeLlmProvider({
      object: {
        claims: [
          {
            dimension: "constraint",
            label: "minimal-diff",
            confidence: -0.3,
            rationale: "Underconfident",
            supportingEvidenceIDs: ["ev_001"],
          },
        ],
      },
      rawText: "{}",
      metadata: makeMetadata(),
    });

    const result = await reduceCategoryClaimsViaLLM(
      claims,
      "constraint",
      evidence,
      budget,
      provider,
    );

    expect(result.claims[0]!.confidence).toBe(0);
  });

  it("creates a valid LLM trace", async () => {
    const evidence = [makeEvidence({ evidenceID: "ev_001" })];
    const claims = [makeClaim()];

    const provider = makeLlmProvider({
      object: {
        claims: [
          {
            dimension: "constraint",
            label: "minimal-diff",
            confidence: 0.8,
            rationale: "Test",
            supportingEvidenceIDs: ["ev_001"],
          },
        ],
      },
      rawText: '{"claims":[]}',
      metadata: makeMetadata(),
    });

    const result = await reduceCategoryClaimsViaLLM(
      claims,
      "constraint",
      evidence,
      budget,
      provider,
    );

    expect(result.trace.traceID).toMatch(/^trace_/);
    expect(result.trace.request.promptName).toBe("category-synthesize-claims");
    expect(result.trace.stage).toBe("category-claims");
    expect(result.trace.schemaVersion).toBe("llm-trace/v1");
  });

  it("surfaces weak evidence areas", async () => {
    const evidence = [makeEvidence({ evidenceID: "ev_001" })];
    const claims = [makeClaim()];

    const provider = makeLlmProvider({
      object: {
        claims: [
          {
            dimension: "constraint",
            label: "minimal-diff",
            confidence: 0.3,
            rationale: "Weak",
            supportingEvidenceIDs: ["ev_001"],
          },
        ],
        weakEvidenceAreas: [
          {
            description: "Very few examples of constraint enforcement",
            dimension: "constraint",
            evidenceCount: 1,
            suggestedMinimum: 5,
          },
        ],
      },
      rawText: "{}",
      metadata: makeMetadata(),
    });

    const result = await reduceCategoryClaimsViaLLM(
      claims,
      "constraint",
      evidence,
      budget,
      provider,
    );

    expect(result.weakEvidenceAreas).toHaveLength(1);
    expect(result.weakEvidenceAreas[0]!.evidenceCount).toBe(1);
    expect(result.weakEvidenceAreas[0]!.suggestedMinimum).toBe(5);
  });
});

describe("reduceAllCategories", () => {
  it("reduces all 4 dimensions and returns results keyed by dimension", async () => {
    const evidence = [
      makeEvidence({ evidenceID: "ev_001", dimensions: ["constraint"] }),
      makeEvidence({ evidenceID: "ev_002", dimensions: ["work-style"] }),
      makeEvidence({ evidenceID: "ev_003", dimensions: ["communication-style"] }),
      makeEvidence({ evidenceID: "ev_004", dimensions: ["validation-habit"] }),
    ];

    const provider = makeLlmProvider({
      object: {
        claims: [
          {
            dimension: "constraint",
            label: "minimal-diff",
            confidence: 0.8,
            rationale: "Test",
            supportingEvidenceIDs: ["ev_001"],
          },
        ],
      },
      rawText: "{}",
      metadata: makeMetadata(),
    });

    const { results, traces } = await reduceAllCategories(
      [],
      evidence,
      budget,
      provider,
    );

    expect(Object.keys(results)).toHaveLength(4);
    expect(results["communication-style"]).toBeDefined();
    expect(results["constraint"]).toBeDefined();
    expect(results["validation-habit"]).toBeDefined();
    expect(results["work-style"]).toBeDefined();
    expect(traces).toHaveLength(4);
  });
});

describe("DEFAULT_REDUCE_BUDGET", () => {
  it("has sensible defaults", () => {
    expect(DEFAULT_REDUCE_BUDGET.tokenBudget).toBe(8000);
    expect(DEFAULT_REDUCE_BUDGET.timeoutMs).toBe(30_000);
    expect(DEFAULT_REDUCE_BUDGET.temperature).toBe(0.2);
  });
});
