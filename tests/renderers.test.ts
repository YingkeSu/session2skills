import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { renderSkill } from "../src/generate/render-skill.js";
import { renderSummary } from "../src/generate/render-summary.js";
import { sampleProfile } from "./fixtures/sample-profile.js";
import { sampleProfileV2 } from "./fixtures/sample-profile-v2.js";

describe("renderers", () => {
  it("renders legacy summary markdown matching the golden file", () => {
    const expected = readFileSync(path.resolve("tests/golden/summary.md"), "utf8");

    expect(renderSummary(sampleProfile)).toBe(expected);
  });

  it("renders skill markdown matching the golden file", () => {
    const expected = readFileSync(path.resolve("tests/golden/SKILL.md"), "utf8");

    expect(renderSkill(sampleProfile)).toBe(expected);
  });

  it("renders ProfileV2 summary with merged claims sections", () => {
    const result = renderSummary(sampleProfileV2, { tone: "balanced" });

    expect(result).toContain("# Session2Skills Audit Summary");
    expect(result).toContain("## Strongest Signals");
    expect(result).toContain("## Confidence Notes");
    expect(result).toContain("## Unresolved Areas");
    expect(result).toContain("## Evidence Excerpts");
    expect(result).toContain("## Source Attribution");
    expect(result).toContain("schema: profile/v2");
    expect(result).toContain("status: accepted");
    expect(result).toContain("sources: rule+llm");
  });

  it("renders hybrid summary markdown matching the golden file", () => {
    const expected = readFileSync(path.resolve("tests/golden/summary-hybrid.md"), "utf8");

    expect(renderSummary(sampleProfileV2, { tone: "balanced" })).toBe(expected);
  });

  it("renders ProfileV2 summary deterministically", () => {
    const first = renderSummary(sampleProfileV2, { tone: "balanced" });
    const second = renderSummary(sampleProfileV2, { tone: "balanced" });

    expect(first).toBe(second);
  });

  it("respects tone concise for ProfileV2", () => {
    const result = renderSummary(sampleProfileV2, { tone: "concise" });

    expect(result).not.toContain("rationale text here");
  });

  it("shows tentative status for contradicted claims", () => {
    const result = renderSummary(sampleProfileV2, { tone: "balanced" });

    expect(result).toContain("status: tentative");
    expect(result).toContain("[contradicted]");
  });
});
