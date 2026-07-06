import { describe, expect, it } from "vitest";

import { confidenceTier } from "./confidence.js";

describe("confidenceTier", () => {
  it("classifies >= 0.8 as high", () => {
    expect(confidenceTier(0.8)).toBe("high");
    expect(confidenceTier(0.95)).toBe("high");
    expect(confidenceTier(1)).toBe("high");
  });

  it("classifies the 0.5–0.8 band as medium", () => {
    expect(confidenceTier(0.5)).toBe("medium");
    expect(confidenceTier(0.6)).toBe("medium");
    expect(confidenceTier(0.79)).toBe("medium");
  });

  it("classifies < 0.5 as low", () => {
    expect(confidenceTier(0.49)).toBe("low");
    expect(confidenceTier(0)).toBe("low");
  });

  it("falls back to low for non-finite input", () => {
    expect(confidenceTier(Number.NaN)).toBe("low");
    expect(confidenceTier(Number.POSITIVE_INFINITY)).toBe("low");
  });
});
