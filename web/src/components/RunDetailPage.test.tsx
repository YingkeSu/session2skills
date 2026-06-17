import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "../i18n/LocaleContext.js";
import { DetailShell, RunDetailPageView } from "./RunDetailPage.js";
import type { RunDetail } from "../runs.js";

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
