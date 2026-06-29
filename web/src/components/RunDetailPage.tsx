import { useCallback, useState, type JSX, type KeyboardEvent, type ReactNode } from "react";

import { LanguageToggle } from "../i18n/LanguageToggle.js";
import { useLocale } from "../i18n/LocaleContext.js";
import { type RunDetail, type SkillEvaluation } from "../runs.js";
import { useEvaluateMutation, useRunDetailQuery } from "../hooks/useQueries.js";
import { AuditViewTab } from "./AuditViewTab.js";
import { PreviewTracesTab } from "./PreviewTracesTab.js";
import { ReportsTab } from "./ReportsTab.js";
import { ScoreCard } from "./ScoreCard.js";

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
  evaluationState?: EvaluationState;
  onEvaluate?: () => void;
  children?: ReactNode;
};

type RunDetailPageViewProps = RunDetailPageProps & {
  status: "loading" | "error" | "ready";
  error: string;
  detail: RunDetail | null;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  evaluationState: EvaluationState;
  onEvaluate: () => void;
};

type EvaluationState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "ready"; evaluation: SkillEvaluation }
  | { status: "error"; message: string };

export function RunDetailPage({
  runName,
  onBack,
}: RunDetailPageProps): JSX.Element {
  const { data: detail, isLoading, error: detailError } = useRunDetailQuery(runName);
  const [activeTab, setActiveTab] = useState<Tab>("audit");
  const [evaluation, setEvaluation] = useState<SkillEvaluation | null>(null);
  const [evaluateError, setEvaluateError] = useState<string | null>(null);
  const evaluateMutation = useEvaluateMutation();

  const handleEvaluate = async (): Promise<void> => {
    setEvaluation(null);
    setEvaluateError(null);
    try {
      const result = await evaluateMutation.mutateAsync(runName);
      setEvaluation(result);
    } catch (err: unknown) {
      setEvaluateError(err instanceof Error ? err.message : String(err));
    }
  };

  const evaluationState: EvaluationState = evaluateMutation.isPending
    ? { status: "pending" }
    : evaluation
      ? { status: "ready", evaluation }
      : evaluateError
        ? { status: "error", message: evaluateError }
        : { status: "idle" };

  const status = isLoading ? "loading" : detailError ? "error" : "ready";
  const errorMessage = detailError instanceof Error ? detailError.message : detailError ? String(detailError) : "";

  return (
    <RunDetailPageView
      runName={runName}
      onBack={onBack}
      status={status}
      error={errorMessage}
      detail={detail ?? null}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      evaluationState={evaluationState}
      onEvaluate={handleEvaluate}
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
  evaluationState,
  onEvaluate,
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
      evaluationState={evaluationState}
      onEvaluate={onEvaluate}
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
                writerSections={readyDetail.writerSections}
                traces={readyDetail.traces}
              />
            </section>
          )}
          <section style={evaluateCardStyle}>
            <div style={evaluateHeaderStyle}>
              <h3 style={evaluateTitleStyle}>{t("detail.evaluateTitle")}</h3>
              <button
                type="button"
                data-testid="evaluate-button"
                onClick={onEvaluate}
                disabled={evaluationState.status === "pending"}
                style={evaluateButtonStyle}
              >
                {t("detail.evaluate")}
              </button>
            </div>
            {evaluationState.status === "pending" && (
              <ShellState>{t("detail.evaluating")}</ShellState>
            )}
            {evaluationState.status === "error" && (
              <ShellState tone="error">
                {t("detail.evaluateErrorPrefix", { message: evaluationState.message })}
              </ShellState>
            )}
            {evaluationState.status === "ready" && (
              <div style={evaluateResultStyle}>
                <div>{t("detail.verdict")}: {evaluationState.evaluation.verdict}</div>
                <div>{t("detail.gates")}: {evaluationState.evaluation.gates.lint}/{evaluationState.evaluation.gates.redaction}/{evaluationState.evaluation.gates.grounding}</div>
              </div>
            )}
          </section>
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
  evaluationState,
  onEvaluate,
  children,
}: DetailShellProps): JSX.Element {
  const { t } = useLocale();
  const tabs: { id: Tab; label: string }[] = [
    { id: "audit", label: t("tab.audit") },
    { id: "reports", label: t("tab.reports") },
    { id: "preview", label: t("tab.preview") },
  ];
  const reportStatus = detail ? describeReportStatus(detail, t) : null;
  const currentEvaluationState: EvaluationState = evaluationState ?? {
    status: "idle",
  };
  const scoreCardEvaluation =
    currentEvaluationState.status === "ready"
      ? currentEvaluationState.evaluation
      : null;

  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
      let nextIndex: number | null = null;

      switch (event.key) {
        case "ArrowRight":
          nextIndex = (currentIndex + 1) % tabs.length;
          break;
        case "ArrowLeft":
          nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = tabs.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      const nextTab = tabs[nextIndex];
      onTabChange(nextTab.id);
      const nextButton = document.getElementById(`run-detail-tab-${nextTab.id}`);
      nextButton?.focus();
    },
    [activeTab, tabs, onTabChange],
  );

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

      {scoreCardEvaluation && (
        <section aria-label="Score card" style={scoreCardSectionStyle}>
          <ScoreCard evaluation={scoreCardEvaluation} />
        </section>
      )}

      <nav aria-label={t("app.title")} role="tablist" style={tabsStyle}>
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`run-detail-tab-${tab.id}`}
              type="button"
              role="tab"
              data-testid={`${tab.id}-tab`}
              aria-selected={selected}
              aria-controls={`run-detail-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={handleTabKeyDown}
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
        color: tone === "error" ? "var(--danger)" : "var(--ink-muted)",
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
  fontFamily: "var(--font-sans)",
  padding: "var(--space-6)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-4)",
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-3)",
};

const backButtonStyle: React.CSSProperties = {
  padding: "var(--space-2) var(--space-3)",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  color: "var(--ink-2)",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--space-4)",
  flexWrap: "wrap",
};

const titleClusterStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-1)",
  minWidth: 0,
};

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--text-xs)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 600,
  color: "var(--ink-muted)",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--text-2xl)",
  lineHeight: 1.2,
  letterSpacing: "-0.01em",
  wordBreak: "break-word",
  color: "var(--ink)",
};

const statusClusterStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const statusMetaStyle: React.CSSProperties = {
  fontSize: "var(--text-sm)",
  color: "var(--ink-2)",
};

function statusPillStyle(tone: "pass" | "fail"): React.CSSProperties {
  return {
    padding: "var(--space-1) var(--space-3)",
    borderRadius: "var(--radius-pill)",
    fontSize: "var(--text-sm)",
    fontWeight: 600,
    color: "var(--ink-on-fill)",
    background: tone === "pass" ? "var(--success)" : "var(--danger)",
  };
}

const tabsStyle: React.CSSProperties = {
  display: "flex",
  gap: "var(--space-2)",
  borderBottom: "1px solid var(--border)",
};

function tabButtonStyle(selected: boolean): React.CSSProperties {
  return {
    minWidth: "112px",
    minHeight: "40px",
    padding: "var(--space-2) var(--space-4)",
    border: "none",
    borderBottom: selected ? "2px solid var(--accent)" : "2px solid transparent",
    background: "transparent",
    cursor: "pointer",
    fontSize: "var(--text-base)",
    fontWeight: selected ? 600 : 400,
    color: selected ? "var(--accent)" : "var(--ink-2)",
    marginBottom: "-1px",
  };
}

const contentStyle: React.CSSProperties = {
  minHeight: "160px",
};

const shellStateStyle: React.CSSProperties = {
  padding: "var(--space-8)",
  textAlign: "center",
};

const scoreCardSectionStyle: React.CSSProperties = {
  marginBottom: "var(--space-1)",
};

const evaluateCardStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "var(--space-4)",
  background: "var(--surface)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
};

const evaluateHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-3)",
};

const evaluateTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--text-md)",
  fontWeight: 700,
  color: "var(--ink)",
};

const evaluateButtonStyle: React.CSSProperties = {
  padding: "var(--space-2) var(--space-3)",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--accent)",
  background: "var(--accent)",
  color: "var(--ink-on-fill)",
  cursor: "pointer",
  fontWeight: 600,
};

const evaluateResultStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-1)",
  fontSize: "var(--text-sm)",
  color: "var(--ink)",
};

