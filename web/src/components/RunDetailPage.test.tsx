import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "../i18n/LocaleContext.js";
import { DetailShell } from "./RunDetailPage.js";
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
