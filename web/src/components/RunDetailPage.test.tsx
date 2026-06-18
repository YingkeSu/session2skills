// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "../i18n/LocaleContext.js";
import { DetailShell, RunDetailPageView } from "./RunDetailPage.js";
import type { RunDetail } from "../runs.js";
import { useState } from "react";

describe("DetailShell", () => {
  it("renders a stable ready shell with run identity, report status, and tabs", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <DetailShell
          runName="2026-06-analyst-run"
          detail={readyDetail}
          activeTab="audit"
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
    expect(html).toContain("审计视图");
    expect(html).toContain("报告");
    expect(html).toContain("预览与追踪");
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

    const auditMatch = html.match(/data-testid="audit-tab"[^>]*tabindex="-1"/);
    expect(auditMatch).not.toBeNull();

    const previewMatch = html.match(/data-testid="preview-tab"[^>]*tabindex="-1"/);
    expect(previewMatch).not.toBeNull();
  });
});

describe("RunDetailPageView", () => {
  it("renders deterministic skill evaluation verdict and gates", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <RunDetailPageView
          runName="2026-06-analyst-run"
          status="ready"
          error=""
          detail={readyDetail}
          activeTab="reports"
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
          activeTab="audit"
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

describe("Tab keyboard navigation", () => {
  function TabNavigationWrapper({ initial }: { initial?: "audit" | "reports" | "preview" } = {}) {
    const [tab, setTab] = useState<"audit" | "reports" | "preview">(initial ?? "audit");
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

  function renderIntoDom(initial?: "audit" | "reports" | "preview") {
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

    const auditTab = container.querySelector('[data-testid="audit-tab"]') as HTMLElement;
    act(() => {
      auditTab.focus();
    });
    act(() => {
      auditTab.dispatchEvent(
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

    const auditTab = container.querySelector('[data-testid="audit-tab"]') as HTMLElement;
    expect(auditTab.getAttribute("aria-selected")).toBe("true");

    act(() => { root.unmount(); });
    container.remove();
  });

  it("wraps from last tab to first on ArrowRight", () => {
    const { container, root } = renderIntoDom("preview");

    const previewTab = container.querySelector('[data-testid="preview-tab"]') as HTMLElement;
    act(() => {
      previewTab.focus();
    });
    act(() => {
      previewTab.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });

    const auditTab = container.querySelector('[data-testid="audit-tab"]') as HTMLElement;
    expect(auditTab.getAttribute("aria-selected")).toBe("true");

    act(() => { root.unmount(); });
    container.remove();
  });

  it("wraps from first tab to last on ArrowLeft", () => {
    const { container, root } = renderIntoDom("audit");

    const auditTab = container.querySelector('[data-testid="audit-tab"]') as HTMLElement;
    act(() => {
      auditTab.focus();
    });
    act(() => {
      auditTab.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      );
    });

    const previewTab = container.querySelector('[data-testid="preview-tab"]') as HTMLElement;
    expect(previewTab.getAttribute("aria-selected")).toBe("true");

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
