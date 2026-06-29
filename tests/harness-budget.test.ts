import { afterEach, describe, expect, it } from "vitest";

import { resolveHarnessBudget } from "../src/harness/stage-runner.js";
import { DEFAULT_HARNESS_BUDGET } from "../src/harness/types.js";

describe("resolveHarnessBudget", () => {
  const original = process.env.SESSION2SKILLS_MAX_OUTPUT_TOKENS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.SESSION2SKILLS_MAX_OUTPUT_TOKENS;
    } else {
      process.env.SESSION2SKILLS_MAX_OUTPUT_TOKENS = original;
    }
  });

  it("uses the default budget when nothing is configured", () => {
    delete process.env.SESSION2SKILLS_MAX_OUTPUT_TOKENS;
    expect(resolveHarnessBudget()).toEqual(DEFAULT_HARNESS_BUDGET);
  });

  it("honors SESSION2SKILLS_MAX_OUTPUT_TOKENS override", () => {
    // Regression: reasoning models (e.g. Step 3.7 Flash) need a large output
    // budget because their hidden reasoning counts against max_tokens; the
    // default starves them and the structured JSON never appears.
    process.env.SESSION2SKILLS_MAX_OUTPUT_TOKENS = "32768";
    expect(resolveHarnessBudget().maxOutputTokens).toBe(32768);
  });

  it("ignores invalid SESSION2SKILLS_MAX_OUTPUT_TOKENS values", () => {
    process.env.SESSION2SKILLS_MAX_OUTPUT_TOKENS = "not-a-number";
    expect(resolveHarnessBudget().maxOutputTokens).toBe(DEFAULT_HARNESS_BUDGET.maxOutputTokens);

    process.env.SESSION2SKILLS_MAX_OUTPUT_TOKENS = "0";
    expect(resolveHarnessBudget().maxOutputTokens).toBe(DEFAULT_HARNESS_BUDGET.maxOutputTokens);
  });

  it("explicit partial budget wins over the env override", () => {
    process.env.SESSION2SKILLS_MAX_OUTPUT_TOKENS = "32768";
    expect(resolveHarnessBudget({ maxOutputTokens: 4096 }).maxOutputTokens).toBe(4096);
  });
});
