import { describe, expect, it } from "vitest";

import type { RunSummary } from "../runs.js";
import { DEFAULT_RUN_FILTERS, distinctModels, filterRuns } from "./run-filters.js";

function run(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    name: "run-a",
    model: "gpt-4.1",
    generatedAt: "2024-01-01T00:00:00.000Z",
    verifierPassed: true,
    claimCount: 1,
    skepticScore: 0.8,
    skepticIssueCount: 0,
    ...overrides,
  };
}

describe("filterRuns", () => {
  it("returns all runs with default filters", () => {
    const runs = [run({ name: "a" }), run({ name: "b" })];
    expect(filterRuns(runs, DEFAULT_RUN_FILTERS)).toHaveLength(2);
  });

  it("matches search against the name (case-insensitive substring)", () => {
    const runs = [run({ name: "alpha" }), run({ name: "beta" })];
    const out = filterRuns(runs, { ...DEFAULT_RUN_FILTERS, search: "ALP" });
    expect(out.map((r) => r.name)).toEqual(["alpha"]);
  });

  it("matches search against the model", () => {
    const runs = [
      run({ name: "a", model: "gpt-4.1" }),
      run({ name: "b", model: "claude-sonnet" }),
    ];
    const out = filterRuns(runs, { ...DEFAULT_RUN_FILTERS, search: "claud" });
    expect(out.map((r) => r.name)).toEqual(["b"]);
  });

  it("filters by verifier pass/fail", () => {
    const runs = [
      run({ name: "p", verifierPassed: true }),
      run({ name: "f", verifierPassed: false }),
    ];
    expect(
      filterRuns(runs, { ...DEFAULT_RUN_FILTERS, verifier: "pass" }).map(
        (r) => r.name,
      ),
    ).toEqual(["p"]);
    expect(
      filterRuns(runs, { ...DEFAULT_RUN_FILTERS, verifier: "fail" }).map(
        (r) => r.name,
      ),
    ).toEqual(["f"]);
  });

  it("filters by exact model", () => {
    const runs = [
      run({ name: "a", model: "gpt-4.1" }),
      run({ name: "b", model: "claude" }),
    ];
    expect(
      filterRuns(runs, { ...DEFAULT_RUN_FILTERS, model: "claude" }).map(
        (r) => r.name,
      ),
    ).toEqual(["b"]);
  });

  it("filters by max skeptic score (keeps runs at or below threshold)", () => {
    const runs = [
      run({ name: "hi", skepticScore: 0.9 }),
      run({ name: "lo", skepticScore: 0.3 }),
    ];
    expect(
      filterRuns(runs, { ...DEFAULT_RUN_FILTERS, maxSkepticScore: 0.5 }).map(
        (r) => r.name,
      ),
    ).toEqual(["lo"]);
  });

  it("composes multiple filters", () => {
    const runs = [
      run({ name: "a", model: "gpt-4.1", verifierPassed: true, skepticScore: 0.9 }),
      run({ name: "b", model: "gpt-4.1", verifierPassed: false, skepticScore: 0.2 }),
      run({ name: "c", model: "claude", verifierPassed: false, skepticScore: 0.2 }),
    ];
    const out = filterRuns(runs, {
      ...DEFAULT_RUN_FILTERS,
      verifier: "fail",
      model: "gpt-4.1",
    });
    expect(out.map((r) => r.name)).toEqual(["b"]);
  });

  it("treats whitespace-only search as no filter", () => {
    const runs = [run({ name: "a" }), run({ name: "b" })];
    expect(
      filterRuns(runs, { ...DEFAULT_RUN_FILTERS, search: "   " }),
    ).toHaveLength(2);
  });
});

describe("distinctModels", () => {
  it("returns distinct models in first-seen order", () => {
    const runs = [
      run({ model: "gpt-4.1" }),
      run({ model: "claude" }),
      run({ model: "gpt-4.1" }),
    ];
    expect(distinctModels(runs)).toEqual(["gpt-4.1", "claude"]);
  });
});
