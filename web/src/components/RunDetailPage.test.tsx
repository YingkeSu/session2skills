// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "../i18n/LocaleContext.js";
import { DetailShell, OverviewPanel, RunDetailPageView } from "./RunDetailPage.js";
import type { RunDetail } from "../runs.js";

describe("DetailShell", () => {
  it("renders a stable ready shell with run identity, report status, and tabs", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <DetailShell
          runName="2026-06-analyst-run"
          detail={readyDetail}
          activeTab="overview"
          onBack={() => undefined}
          onTabChange={() => undefined}
        >
          <p>ready content</p>
        </DetailShell>
      </LocaleProvider>,
    );

    expect(html).toContain("2026-06-analyst-run");
    expect(html).toContain("通过");
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-selected="false"');
    expect(html).toContain("概览");
    expect(html).toContain("报告");
    expect(html).toContain("预览与追踪");
    expect(html).toContain("声明与证据");
  });

  it("applies roving tabindex so only the active tab is focusable", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <DetailShell
          runName="2026-06-analyst-run"
          detail={readyDetail}
          activeTab="reports"
          onBack={() => undefined}
          onTabChange={() => undefined}
        >
          <p>content</p>
        </DetailShell>
      </LocaleProvider>,
    );

    expect(html).toContain('data-testid="reports-tab"');
    const reportsMatch = html.match(/data-testid="reports-tab"[^>]*tabindex="0"/);
    expect(reportsMatch).not.toBeNull();

    const overviewMatch = html.match(/data-testid="overview-tab"[^>]*tabindex="-1"/);
    expect(overviewMatch).not.toBeNull();

    const previewMatch = html.match(/data-testid="preview-tab"[^>]*tabindex="-1"/);
    expect(previewMatch).not.toBeNull();

    const claimsMatch = html.match(/data-testid="claims-tab"[^>]*tabindex="-1"/);
    expect(claimsMatch).not.toBeNull();
  });
});

describe("RunDetailPageView", () => {
  it("renders the overview panel by default and leads with the quality verdict", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <RunDetailPageView
          runName="2026-06-analyst-run"
          status="ready"
          error=""
          detail={readyDetail}
          activeTab="overview"
          onBack={() => undefined}
          onTabChange={() => undefined}
          evaluationState={{ status: "idle" }}
          onEvaluate={() => undefined}
        />
      </LocaleProvider>,
    );

    // Overview-first: verdict + skeptic score + metric tiles above raw evidence.
    expect(html).toContain('data-testid="overview-verdict"');
    expect(html).toContain('data-testid="overview-skeptic-score"');
    expect(html).toContain('data-testid="overview-metric-claims"');
    expect(html).toContain("技能评估");
    // Evaluate action lives inside the overview.
    expect(html).toContain('data-testid="evaluate-button"');
  });

  it("renders deterministic skill evaluation verdict and gates", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <RunDetailPageView
          runName="2026-06-analyst-run"
          status="ready"
          error=""
          detail={readyDetail}
          activeTab="overview"
          onBack={() => undefined}
          onTabChange={() => undefined}
          evaluationState={{
            status: "ready",
            evaluation: {
              schemaVersion: "skill-evaluation/v1",
              skillID: "2026-06-analyst-run",
              evaluatedAt: "2026-06-17T08:30:00.000Z",
              gates: {
                lint: "pass",
                redaction: "pass",
                grounding: "fail",
              },
              scores: {
                grounding: 0,
                actionability: 0.8,
                specificity: 0.7,
                safety: 0.9,
                concision: 1,
                discoverability: 0.7,
              },
              verdict: "needs-patch",
              issues: [],
            },
          }}
          onEvaluate={() => undefined}
        />
      </LocaleProvider>,
    );

    expect(html).toContain("技能评估");
    expect(html).toContain("needs-patch");
    expect(html).toContain("pass/pass/fail");
  });

  it("disables the evaluate button while evaluation is pending", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <RunDetailPageView
          runName="2026-06-analyst-run"
          status="ready"
          error=""
          detail={readyDetail}
          activeTab="overview"
          onBack={() => undefined}
          onTabChange={() => undefined}
          evaluationState={{ status: "pending" }}
          onEvaluate={() => undefined}
        />
      </LocaleProvider>,
    );

    expect(html).toContain('data-testid="evaluate-button"');
    const buttonMatch = html.match(
      /data-testid="evaluate-button"[^>]*disabled/,
    );
    expect(buttonMatch).not.toBeNull();
  });
});

describe("OverviewPanel", () => {
  it("leads with verdict, skeptic score, metrics, and a prioritized next-step cue", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <OverviewPanel
          detail={failedDetail}
          evaluationState={{ status: "idle" }}
          onEvaluate={() => undefined}
          onNavigate={() => undefined}
        />
      </LocaleProvider>,
    );

    // Verdict fail + skeptic score surfaced above raw evidence.
    expect(html).toContain("失败");
    expect(html).toContain("33%");
    // Metric tiles for trust judgement.
    expect(html).toContain('data-testid="overview-metric-fabricated"');
    expect(html).toContain("虚构指令");
    // Prioritized cue for the failed verifier, pointing at Reports.
    expect(html).toContain('data-testid="overview-cue-verifier-failed"');
    // Top-issues preview surfaces the high-severity problem type.
    expect(html).toContain("首要问题");
    expect(html).toContain("overconfident");
    // Grounding summary uses counts, not raw evidence IDs.
    expect(html).toContain("1 条声明");
    // No raw evidence excerpts on the overview.
    expect(html).not.toContain("sessionID");
  });

  it("groups trust metrics into one semantic audit summary", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <OverviewPanel
          detail={readyDetail}
          evaluationState={{ status: "idle" }}
          onEvaluate={() => undefined}
          onNavigate={() => undefined}
        />
      </LocaleProvider>,
    );

    expect(html).toContain('<dl class="overview-audit-summary" data-testid="overview-audit-summary">');
    expect(html).toContain('data-testid="overview-metric-claims"');
    expect(html).toContain('data-testid="overview-metric-evidence"');
  });

  it("navigates to the target tab on cue click and triggers evaluate for the evaluate cue", () => {
    const onNavigate = vi.fn();
    const onEvaluate = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <LocaleProvider>
          <OverviewPanel
            detail={failedDetail}
            evaluationState={{ status: "idle" }}
            onEvaluate={onEvaluate}
            onNavigate={onNavigate}
          />
        </LocaleProvider>,
      );
    });

    const verifierCue = container.querySelector(
      '[data-testid="overview-cue-verifier-failed"]',
    ) as HTMLButtonElement;
    act(() => {
      verifierCue.click();
    });
    expect(onNavigate).toHaveBeenCalledWith("reports");

    const evaluateCue = container.querySelector(
      '[data-testid="overview-cue-evaluate"]',
    ) as HTMLButtonElement;
    act(() => {
      evaluateCue.click();
    });
    expect(onEvaluate).toHaveBeenCalled();

    const viewAll = container.querySelector(
      ".overview-issues button",
    ) as HTMLButtonElement;
    act(() => {
      viewAll.click();
    });
    expect(onNavigate).toHaveBeenCalledWith("reports");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

describe("Tab keyboard navigation", () => {
  function TabNavigationWrapper({
    initial,
  }: {
    initial?: "overview" | "reports" | "preview" | "claims";
  } = {}) {
    const [tab, setTab] = useState<"overview" | "reports" | "preview" | "claims">(
      initial ?? "overview",
    );
    return (
      <LocaleProvider>
        <DetailShell
          runName="test-run"
          detail={readyDetail}
          activeTab={tab}
          onBack={() => undefined}
          onTabChange={setTab}
        >
          <p>content</p>
        </DetailShell>
      </LocaleProvider>
    );
  }

  function renderIntoDom(initial?: "overview" | "reports" | "preview" | "claims") {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<TabNavigationWrapper initial={initial} />);
    });
    return { container, root };
  }

  it("moves focus to the next tab on ArrowRight", () => {
    const { container, root } = renderIntoDom();

    const overviewTab = container.querySelector('[data-testid="overview-tab"]') as HTMLElement;
    act(() => {
      overviewTab.focus();
    });
    act(() => {
      overviewTab.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });

    const reportsTab = container.querySelector('[data-testid="reports-tab"]') as HTMLElement;
    expect(reportsTab.getAttribute("aria-selected")).toBe("true");

    act(() => { root.unmount(); });
    container.remove();
  });

  it("moves focus to the previous tab on ArrowLeft", () => {
    const { container, root } = renderIntoDom("reports");

    const reportsTab = container.querySelector('[data-testid="reports-tab"]') as HTMLElement;
    act(() => {
      reportsTab.focus();
    });
    act(() => {
      reportsTab.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      );
    });

    const overviewTab = container.querySelector('[data-testid="overview-tab"]') as HTMLElement;
    expect(overviewTab.getAttribute("aria-selected")).toBe("true");

    act(() => { root.unmount(); });
    container.remove();
  });

  it("wraps from last tab to first on ArrowRight", () => {
    const { container, root } = renderIntoDom("claims");

    const claimsTab = container.querySelector('[data-testid="claims-tab"]') as HTMLElement;
    act(() => {
      claimsTab.focus();
    });
    act(() => {
      claimsTab.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });

    const overviewTab = container.querySelector('[data-testid="overview-tab"]') as HTMLElement;
    expect(overviewTab.getAttribute("aria-selected")).toBe("true");

    act(() => { root.unmount(); });
    container.remove();
  });

  it("wraps from first tab to last on ArrowLeft", () => {
    const { container, root } = renderIntoDom("overview");

    const overviewTab = container.querySelector('[data-testid="overview-tab"]') as HTMLElement;
    act(() => {
      overviewTab.focus();
    });
    act(() => {
      overviewTab.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      );
    });

    const claimsTab = container.querySelector('[data-testid="claims-tab"]') as HTMLElement;
    expect(claimsTab.getAttribute("aria-selected")).toBe("true");

    act(() => { root.unmount(); });
    container.remove();
  });
});

const readyDetail: RunDetail = {
  name: "2026-06-analyst-run",
  claimManifest: {
    schemaVersion: "claim-manifest/v1",
    claims: [],
    evidenceSummary: "Evidence was collected from local sessions.",
    dimensionsCovered: [],
    metadata: {
      generatedAt: "2026-06-17T08:00:00.000Z",
      sessionCount: 2,
      totalEvidenceItems: 4,
    },
  },
  skepticReport: {
    schemaVersion: "skeptic-report/v1",
    issues: [],
    overallScore: 0.92,
    metadata: {
      generatedAt: "2026-06-17T08:00:00.000Z",
      claimCount: 0,
      issueCount: 0,
    },
  },
  verifierReport: {
    schemaVersion: "verifier-report/v1",
    pass: true,
    checkedItems: [],
    issues: [],
    metadata: {
      generatedAt: "2026-06-17T08:00:00.000Z",
      directiveCount: 3,
      verifiedCount: 3,
      fabricatedCount: 0,
    },
  },
  writerSections: null,
  skillMarkdown: "# Generated skill",
  traces: [],
};

const failedDetail: RunDetail = {
  name: "2026-06-failed-run",
  claimManifest: {
    schemaVersion: "claim-manifest/v1",
    claims: [
      {
        id: "claim-1",
        dimension: "constraint",
        label: "minimal-diff",
        confidence: 0.6,
        rationale: "Prefers small diffs.",
        evidenceRefs: ["sessionID:messageID:partID"],
      },
    ],
    evidenceSummary: "Mixed evidence was collected from local sessions.",
    dimensionsCovered: ["constraint"],
    metadata: {
      generatedAt: "2026-06-17T08:00:00.000Z",
      sessionCount: 1,
      totalEvidenceItems: 5,
    },
  },
  skepticReport: {
    schemaVersion: "skeptic-report/v1",
    issues: [
      {
        claimId: "claim-1",
        severity: "high",
        problemType: "overconfident",
        detail: "Claim confidence is not supported by the cited evidence.",
        suggestion: "Lower confidence or add stronger evidence.",
      },
    ],
    overallScore: 0.33,
    metadata: {
      generatedAt: "2026-06-17T08:00:00.000Z",
      claimCount: 1,
      issueCount: 1,
    },
  },
  verifierReport: {
    schemaVersion: "verifier-report/v1",
    pass: false,
    checkedItems: [
      { directive: "Prefer minimal diffs.", claimId: "claim-1", status: "fabricated" },
    ],
    issues: [],
    metadata: {
      generatedAt: "2026-06-17T08:00:00.000Z",
      directiveCount: 1,
      verifiedCount: 0,
      fabricatedCount: 1,
    },
  },
  writerSections: null,
  skillMarkdown: "# Generated skill",
  traces: [{ stage: "verifier", model: "m", provider: "p" }],
};
