import type { HarnessBudget } from "./types.js";
import { DEFAULT_HARNESS_BUDGET } from "./types.js";

export function resolveHarnessBudget(budget?: Partial<HarnessBudget>): HarnessBudget {
  return { ...DEFAULT_HARNESS_BUDGET, ...budget };
}
