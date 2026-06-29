import type { HarnessBudget } from "./types.js";
import { DEFAULT_HARNESS_BUDGET } from "./types.js";

/**
 * Per-stage output-budget override. Reasoning models can need far more output
 * tokens than the default (their hidden reasoning counts against the budget),
 * so allow tuning without a code change. Explicit partial budgets still win.
 */
function readEnvMaxOutputTokens(): number | undefined {
  const raw = process.env.SESSION2SKILLS_MAX_OUTPUT_TOKENS;
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function resolveHarnessBudget(budget?: Partial<HarnessBudget>): HarnessBudget {
  const envMaxOutputTokens = readEnvMaxOutputTokens();
  return {
    ...DEFAULT_HARNESS_BUDGET,
    ...(envMaxOutputTokens !== undefined ? { maxOutputTokens: envMaxOutputTokens } : {}),
    ...budget,
  };
}
