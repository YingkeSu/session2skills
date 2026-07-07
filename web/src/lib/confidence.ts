/**
 * Per-claim confidence tier. Thresholds follow the observability spec
 * (>=0.8 strong / 0.5–0.8 medium / <0.5 weak) — intentionally distinct from
 * the run-level skeptic-score bands in App.tsx, which use 0.8/0.6.
 *
 * Kept as a pure function (no React, no CSS) so it is trivially unit-testable
 * and reusable by both the claims view and any future confidence-based filter.
 */
export type ConfidenceTier = "high" | "medium" | "low";

export function confidenceTier(confidence: number): ConfidenceTier {
  if (!Number.isFinite(confidence)) return "low";
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}
