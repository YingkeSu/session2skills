import { describe, expect, it } from "vitest";
import type { EvidenceConfig } from "../../src/harness/packets.js";
import { DEFAULT_EVIDENCE_CONFIG } from "../../src/harness/packets.js";

describe("EvidenceConfig filter params (#58)", () => {
  it("accepts filterMode", () => {
    const cfg: EvidenceConfig = { filterMode: "all" };
    expect(cfg.filterMode).toBe("all");
  });

  it("accepts minHashThreshold", () => {
    const cfg: EvidenceConfig = { minHashThreshold: 0.8 };
    expect(cfg.minHashThreshold).toBe(0.8);
  });

  it("accepts minTextDensity", () => {
    const cfg: EvidenceConfig = { minTextDensity: 7 };
    expect(cfg.minTextDensity).toBe(7);
  });

  it("accepts llmClassifierEnabled (level-4 knob, default false)", () => {
    const cfg: EvidenceConfig = { llmClassifierEnabled: true };
    expect(cfg.llmClassifierEnabled).toBe(true);
  });

  it("exposes default filter values via DEFAULT_EVIDENCE_CONFIG", () => {
    expect(DEFAULT_EVIDENCE_CONFIG.filterMode).toBe("off");
    expect(DEFAULT_EVIDENCE_CONFIG.minHashThreshold).toBe(0.75);
    expect(DEFAULT_EVIDENCE_CONFIG.minTextDensity).toBe(5);
    expect(DEFAULT_EVIDENCE_CONFIG.llmClassifierEnabled).toBe(false);
  });

  it("filterMode union includes all documented modes", () => {
    const modes: Array<NonNullable<EvidenceConfig["filterMode"]>> = [
      "off",
      "structural",
      "structural+density",
      "structural+density+fuzzy",
      "all",
    ];
    expect(modes).toHaveLength(5);
  });
});
