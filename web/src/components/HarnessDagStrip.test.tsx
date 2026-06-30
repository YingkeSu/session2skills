// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "../i18n/LocaleContext.js";
import { HarnessDagStrip } from "./HarnessDagStrip.js";
import type { RunDetail } from "../runs.js";

const baseDetail: RunDetail = {
  name: "2026-06-run",
  claimManifest: {
    schemaVersion: "1",
    claims: [
      {
        id: "c1",
        dimension: "focus",
        label: "focus",
        confidence: 0.9,
        rationale: "r",
        evidenceRefs: [],
      },
    ],
    evidenceSummary: "",
    dimensionsCovered: ["focus"],
    metadata: { generatedAt: "2026-06", sessionCount: 1, totalEvidenceItems: 0 },
  },
  skepticReport: {
    schemaVersion: "1",
    issues: [],
    overallScore: 1,
    metadata: { generatedAt: "2026-06", claimCount: 1, issueCount: 0 },
  },
  verifierReport: {
    schemaVersion: "1",
    pass: true,
    checkedItems: [],
    issues: [],
    metadata: {
      generatedAt: "2026-06",
      directiveCount: 1,
      verifiedCount: 1,
      fabricatedCount: 0,
    },
  },
  writerSections: null,
  skillMarkdown: "# skill",
  traces: [
    { stage: "analyst", model: "m", provider: "p" },
    { stage: "skeptic", model: "m", provider: "p" },
    { stage: "writer", model: "m", provider: "p", finishReason: "stop" },
    { stage: "verifier", model: "m", provider: "p" },
  ],
};

function render(node: React.ReactNode): string {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  act(() => {
    createRoot(container).render(<LocaleProvider>{node}</LocaleProvider>);
  });
  return container.innerHTML;
}

describe("HarnessDagStrip", () => {
  it("renders four stage nodes with labels in the canonical order", () => {
    const html = render(<HarnessDagStrip detail={baseDetail} onStageSelect={() => undefined} />);

    expect(html).toContain("分析");
    expect(html).toContain("质疑");
    expect(html).toContain("撰写");
    expect(html).toContain("验证");
  });

  it("marks stages present in traces as completed (checkmark) and others as missing", () => {
    const detail: RunDetail = {
      ...baseDetail,
      traces: [
        { stage: "analyst", model: "m", provider: "p" },
        { stage: "writer", model: "m", provider: "p", finishReason: "stop" },
      ],
    };
    const html = render(<HarnessDagStrip detail={detail} onStageSelect={() => undefined} />);

    const container = document.body.firstElementChild as HTMLElement;
    const nodes = container.querySelectorAll("[data-stage]");
    expect(nodes).toHaveLength(4);
    expect(nodes[0]?.getAttribute("data-status")).toBe("completed");
    expect(nodes[1]?.getAttribute("data-status")).toBe("missing");
    expect(nodes[2]?.getAttribute("data-status")).toBe("completed");
    expect(nodes[3]?.getAttribute("data-status")).toBe("missing");
  });

  it("flags a stage failed when a trace finished with an error reason", () => {
    const detail: RunDetail = {
      ...baseDetail,
      traces: [
        { stage: "analyst", model: "m", provider: "p", finishReason: "error" },
        { stage: "skeptic", model: "m", provider: "p" },
        { stage: "writer", model: "m", provider: "p" },
        { stage: "verifier", model: "m", provider: "p" },
      ],
    };
    const html = render(<HarnessDagStrip detail={detail} onStageSelect={() => undefined} />);
    expect(html).toContain("data-status=\"failed\"");
  });

  it("marks verifier failed when verifierReport.pass is false", () => {
    const detail: RunDetail = { ...baseDetail, verifierReport: { ...baseDetail.verifierReport!, pass: false } };
    const container = document.body;
    render(<HarnessDagStrip detail={detail} onStageSelect={() => undefined} />);
    const verifier = container.querySelector("[data-stage=\"verifier\"]");
    expect(verifier?.getAttribute("data-status")).toBe("failed");
  });

  it("uses stage-specific color tokens for each node", () => {
    const container = document.body;
    render(<HarnessDagStrip detail={baseDetail} onStageSelect={() => undefined} />);
    const analyst = container.querySelector("[data-stage=\"analyst\"]");
    const skeptic = container.querySelector("[data-stage=\"skeptic\"]");
    const writer = container.querySelector("[data-stage=\"writer\"]");
    const verifier = container.querySelector("[data-stage=\"verifier\"]");
    expect(analyst?.getAttribute("data-stage-color")).toBe("var(--cat-blue)");
    expect(skeptic?.getAttribute("data-stage-color")).toBe("var(--cat-rose)");
    expect(writer?.getAttribute("data-stage-color")).toBe("var(--cat-violet)");
    expect(verifier?.getAttribute("data-stage-color")).toBe("var(--cat-teal)");
  });

  it("renders status glyphs for each node", () => {
    const detail: RunDetail = {
      ...baseDetail,
      traces: [
        { stage: "analyst", model: "m", provider: "p", finishReason: "error" },
        { stage: "skeptic", model: "m", provider: "p" },
      ],
    };
    const html = render(<HarnessDagStrip detail={detail} onStageSelect={() => undefined} />);
    expect(html).toContain("✗");
    expect(html).toContain("⊘");
    expect(html).toContain("✓");
  });

  it("invokes onStageSelect with the stage id when a node is clicked", () => {
    const onStageSelect = vi.fn();
    const container = document.body;
    render(<HarnessDagStrip detail={baseDetail} onStageSelect={onStageSelect} />);
    const writerBtn = container.querySelector<HTMLButtonElement>("[data-stage=\"writer\"]");
    expect(writerBtn).not.toBeNull();
    act(() => {
      writerBtn!.click();
    });
    expect(onStageSelect).toHaveBeenCalledWith("writer");
  });

  it("is keyboard accessible: nodes are buttons with aria-labels", () => {
    const container = document.body;
    render(<HarnessDagStrip detail={baseDetail} onStageSelect={() => undefined} />);
    const buttons = container.querySelectorAll<HTMLButtonElement>("button[data-stage]");
    expect(buttons.length).toBe(4);
    buttons.forEach((b) => {
      expect(b.getAttribute("aria-label")?.length ?? 0).toBeGreaterThan(0);
      expect(b.getAttribute("type")).toBe("button");
    });
  });
});
