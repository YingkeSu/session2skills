import { useEffect, useState, type ReactNode } from "react";

import { LanguageToggle } from "../i18n/LanguageToggle.js";
import { useLocale } from "../i18n/LocaleContext.js";
import { fetchRunDetail, type RunDetail } from "../runs.js";
import { AuditViewTab } from "./AuditViewTab.js";
import { PreviewTracesTab } from "./PreviewTracesTab.js";
import { ReportsTab } from "./ReportsTab.js";

type Tab = "audit" | "reports" | "preview";

type RunDetailPageProps = {
  runName: string;
  onBack: () => void;
};

type DetailShellProps = {
  runName: string;
  detail: RunDetail | null;
  activeTab: Tab;
  onBack: () => void;
  onTabChange: (tab: Tab) => void;
  children?: ReactNode;
};

type RunDetailPageViewProps = RunDetailPageProps & {
  status: "loading" | "error" | "ready";
  error: string;
  detail: RunDetail | null;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
};

export function RunDetailPage({
  runName,
  onBack,
}: RunDetailPageProps): JSX.Element {
  const { t } = useLocale();
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">(
    "loading",
  );
  const [error, setError] = useState<string>("");
  const [tab, setTab] = useState<Tab>("audit");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError("");

    fetchRunDetail(runName)
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
          setStatus("ready");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStatus("error");
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [runName]);

  return (
    <RunDetailPageView
      runName={runName}
      onBack={onBack}
      status={status}
      error={error}
      detail={detail}
      activeTab={tab}
      onTabChange={setTab}
    />
  );
}

export function RunDetailPageView({
  runName,
  onBack,
  status,
  error,
  detail,
  activeTab,
  onTabChange,
}: RunDetailPageViewProps): JSX.Element {
  const { t } = useLocale();
  const readyDetail = status === "ready" ? detail : null;

  return (
    <DetailShell
      runName={runName}
      detail={readyDetail}
      activeTab={activeTab}
      onBack={onBack}
      onTabChange={onTabChange}
    >
      {status === "loading" && <ShellState>{t("detail.loading")}</ShellState>}
      {status === "error" && (
        <ShellState tone="error">
          {t("detail.errorPrefix", { message: error })}
        </ShellState>
      )}
      {readyDetail && (
        <>
          {activeTab === "audit" && (
            <section
              id="run-detail-panel-audit"
              aria-labelledby="run-detail-tab-audit"
              role="tabpanel"
            >
              <AuditViewTab
                manifest={readyDetail.claimManifest ?? EMPTY_MANIFEST}
                skepticReport={readyDetail.skepticReport}
                verifierReport={readyDetail.verifierReport}
                runName={runName}
              />
            </section>
          )}
          {activeTab === "reports" && (
            <section
              id="run-detail-panel-reports"
              aria-labelledby="run-detail-tab-reports"
              role="tabpanel"
            >
              <ReportsTab
                skepticReport={readyDetail.skepticReport}
                verifierReport={readyDetail.verifierReport}
              />
            </section>
          )}
          {activeTab === "preview" && (
            <section
              id="run-detail-panel-preview"
              aria-labelledby="run-detail-tab-preview"
              role="tabpanel"
            >
              <PreviewTracesTab
                skillMarkdown={readyDetail.skillMarkdown}
                traces={readyDetail.traces}
              />
            </section>
          )}
        </>
      )}
    </DetailShell>
  );
}

export function DetailShell({
  runName,
  detail,
  activeTab,
  onBack,
  onTabChange,
  children,
}: DetailShellProps): JSX.Element {
  const { t } = useLocale();
  const tabs: { id: Tab; label: string }[] = [
    { id: "audit", label: t("tab.audit") },
    { id: "reports", label: t("tab.reports") },
    { id: "preview", label: t("tab.preview") },
  ];
  const reportStatus = detail ? describeReportStatus(detail, t) : null;

  return (
    <div style={shellStyle}>
      <div style={headerRowStyle}>
        <button type="button" onClick={onBack} style={backButtonStyle}>
          {t("detail.back")}
        </button>
        <LanguageToggle />
      </div>

      <header style={headerStyle}>
        <div style={titleClusterStyle}>
          <p style={eyebrowStyle}>{t("app.title")}</p>
          <h1 style={titleStyle}>{runName}</h1>
        </div>
        {reportStatus && (
          <div style={statusClusterStyle}>
            <span style={statusPillStyle(reportStatus.pass ? "pass" : "fail")}>
              {reportStatus.pass ? t("badge.pass") : t("badge.fail")}
            </span>
            <span style={statusMetaStyle}>{reportStatus.summary}</span>
          </div>
        )}
      </header>

      <nav aria-label={t("app.title")} role="tablist" style={tabsStyle}>
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`run-detail-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`run-detail-panel-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              style={tabButtonStyle(selected)}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      <main style={contentStyle}>{children}</main>
    </div>
  );
}

function describeReportStatus(
  detail: RunDetail,
  t: ReturnType<typeof useLocale>["t"],
): { pass: boolean; summary: string } {
  const verifierPass = detail.verifierReport?.pass ?? false;
  const skepticIssues = detail.skepticReport?.metadata.issueCount ?? 0;
  const claimCount = detail.claimManifest?.claims.length ?? 0;
  const issueLabel = t("reports.skepticSummary", {
    count: skepticIssues,
    claims: claimCount,
  });

  return {
    pass: verifierPass,
    summary: `${issueLabel} · ${verifierPass ? t("badge.pass") : t("badge.fail")}`,
  };
}

function ShellState({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "error";
}): JSX.Element {
  return (
    <div
      style={{
        ...shellStateStyle,
        color: tone === "error" ? "#c0392b" : "#666",
      }}
    >
      {children}
    </div>
  );
}

const EMPTY_MANIFEST = {
  schemaVersion: "claim-manifest/v1",
  claims: [],
  evidenceSummary: "",
  dimensionsCovered: [],
  metadata: {
    generatedAt: "",
    sessionCount: 0,
    totalEvidenceItems: 0,
  },
} satisfies NonNullable<RunDetail["claimManifest"]>;

const shellStyle: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  padding: "24px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
};

const backButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "4px",
  border: "1px solid #ced4da",
  background: "#fff",
  cursor: "pointer",
  fontSize: "13px",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "16px",
  flexWrap: "wrap",
};

const titleClusterStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  minWidth: 0,
};

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "12px",
  textTransform: "uppercase",
  letterSpacing: 0,
  color: "#6c757d",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "24px",
  lineHeight: 1.2,
  wordBreak: "break-word",
};

const statusClusterStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const statusMetaStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#495057",
};

function statusPillStyle(tone: "pass" | "fail"): React.CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: "999px",
    fontSize: "13px",
    fontWeight: 600,
    color: "#fff",
    background: tone === "pass" ? "#27ae60" : "#c0392b",
  };
}

const tabsStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  borderBottom: "1px solid #dee2e6",
};

function tabButtonStyle(selected: boolean): React.CSSProperties {
  return {
    minWidth: "112px",
    minHeight: "40px",
    padding: "8px 14px",
    border: "none",
    borderBottom: selected ? "2px solid #0d6efd" : "2px solid transparent",
    background: "transparent",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: selected ? 600 : 400,
    color: selected ? "#0d6efd" : "#495057",
    marginBottom: "-1px",
  };
}

const contentStyle: React.CSSProperties = {
  minHeight: "160px",
};

const shellStateStyle: React.CSSProperties = {
  padding: "32px",
  textAlign: "center",
};
