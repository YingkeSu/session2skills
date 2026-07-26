import type { RunSummary } from "../runs.js";

/**
 * Client-side run-list filtering. Pure (no React) so it is trivially unit-
 * testable and memoizable. Composed after the group filter in RunsDashboard.
 *
 * Severity filtering (#32 story 31) is intentionally NOT here: RunSummary
 * carries only an issue count, not a severity breakdown, so it would require
 * a backend change — out of scope for the "4 API endpoints unchanged" rule.
 */
export type VerifierFilter = "all" | "pass" | "fail";

export type RunFilterState = {
  /** Case-insensitive substring matched against `${name} ${model}`. */
  search: string;
  verifier: VerifierFilter;
  /** "" means any model. */
  model: string;
  /** When set, keep only runs with skepticScore <= threshold (find weak runs). */
  maxSkepticScore: number | null;
};

export const DEFAULT_RUN_FILTERS: RunFilterState = {
  search: "",
  verifier: "all",
  model: "",
  maxSkepticScore: null,
};

export function filterRuns(
  runs: RunSummary[],
  state: RunFilterState,
): RunSummary[] {
  const needle = state.search.trim().toLowerCase();
  return runs.filter((run) => {
    if (needle) {
      const haystack = `${run.name} ${run.model}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (state.verifier === "pass" && !run.verifierPassed) return false;
    if (state.verifier === "fail" && run.verifierPassed) return false;
    if (state.model && run.model !== state.model) return false;
    if (
      state.maxSkepticScore !== null &&
      run.skepticScore > state.maxSkepticScore
    ) {
      return false;
    }
    return true;
  });
}

/** Distinct model labels in first-seen order, for the model-filter select. */
export function distinctModels(runs: RunSummary[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const run of runs) {
    if (seen.has(run.model)) continue;
    seen.add(run.model);
    ordered.push(run.model);
  }
  return ordered;
}
