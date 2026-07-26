import { useCallback, useState, type JSX, type KeyboardEvent, type ReactNode } from "react";

import { LanguageToggle } from "../i18n/LanguageToggle.js";
import { useLocale } from "../i18n/LocaleContext.js";
import { type RunDetail, type SkillEvaluation, type SkepticIssue } from "../runs.js";
import { useEvaluateMutation, useRunDetailQuery } from "../hooks/useQueries.js";
import { AuditViewTab } from "./AuditViewTab.js";
import { HarnessDagStrip } from "./HarnessDagStrip.js";
import { PreviewTracesTab } from "./PreviewTracesTab.js";
import { ReportsTab } from "./ReportsTab.js";
import { ScoreCard } from "./ScoreCard.js";

type Tab = "overview" | "reports" | "preview" | "claims";

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
  evaluationState: EvaluationState;
  onEvaluate: () => void;
};

type EvaluationState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "ready"; evaluation: SkillEvaluation }
  | { status: "error"; message: string };

type CueTone = "danger" | "warning" | "accent" | "success" | "neutral";

type NextStepCue = {
  id: string;
  tone: CueTone;
  message: string;
  target?: Tab;
  action?: "evaluate";
};

type OverviewPanelProps = {
  detail: RunDetail;
  evaluationState: EvaluationState;
  onEvaluate: () => void;
  onNavigate: (tab: Tab) => void;
};

export function RunDetailPage({
  runName,
  onBack,
}: RunDetailPageProps): JSX.Element {
  const { data: detail, isLoading, error: detailError } = useRunDetailQuery(runName);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
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
    >
      {status === "loading" && <ShellState>{t("detail.loading")}</ShellState>}
      {status === "error" && (
        <ShellState tone="error">
          {t("detail.errorPrefix", { message: error })}
        </ShellState>
      )}
      {readyDetail && activeTab === "overview" && (
        <section
          id="run-detail-panel-overview"
          aria-labelledby="run-detail-tab-overview"
          role="tabpanel"
        >
          <OverviewPanel
            detail={readyDetail}
            evaluationState={evaluationState}
            onEvaluate={onEvaluate}
            onNavigate={onTabChange}
          />
        </section>
      )}
      {readyDetail && activeTab === "reports" && (
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
      {readyDetail && activeTab === "preview" && (
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
      {readyDetail && activeTab === "claims" && (
        <section
          id="run-detail-panel-claims"
          aria-labelledby="run-detail-tab-claims"
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
    { id: "overview", label: t("tab.overview") },
    { id: "reports", label: t("tab.reports") },
    { id: "preview", label: t("tab.preview") },
    { id: "claims", label: t("tab.claims") },
  ];
  const reportStatus = detail ? describeReportStatus(detail, t) : null;

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
    <div className="detail-shell">
      <div className="detail-utility-row">
        <button type="button" onClick={onBack} className="s2s-btn detail-back">
          {t("detail.back")}
        </button>
        <LanguageToggle />
      </div>

      <header className="detail-header">
        <div className="detail-title-cluster">
          <p className="detail-context">{t("detail.context")}</p>
          <h1>{runName}</h1>
        </div>
        {reportStatus && (
          <div className="detail-status-cluster">
            <span className={`status-badge ${reportStatus.pass ? "pass" : "fail"}`}>
              {reportStatus.pass ? t("badge.pass") : t("badge.fail")}
            </span>
            <span className="detail-status-meta">{reportStatus.summary}</span>
          </div>
        )}
      </header>

      <HarnessDagStrip
        detail={detail}
        onStageSelect={(stage) => onTabChange(stageToTab(stage))}
      />

      <nav aria-label={t("app.title")} role="tablist" className="detail-tabs">
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
              className={selected ? "detail-tab is-active" : "detail-tab"}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      <main className="detail-content">{children}</main>
    </div>
  );
}

export function OverviewPanel({
  detail,
  evaluationState,
  onEvaluate,
  onNavigate,
}: OverviewPanelProps): JSX.Element {
  const { t, tEnum } = useLocale();
  const verifier = detail.verifierReport;
  const skeptic = detail.skepticReport;
  const manifest = detail.claimManifest;

  const claimCount = manifest?.claims.length ?? 0;
  const issueCount = skeptic?.metadata.issueCount ?? 0;
  const fabricated = verifier?.metadata.fabricatedCount ?? 0;
  const evidenceItems = manifest?.metadata.totalEvidenceItems ?? 0;
  const sessionCount = manifest?.metadata.sessionCount ?? 0;
  const verifierPass = verifier?.pass ?? false;
  const skepticScore = skeptic?.overallScore ?? 0;
  const hasSkill = detail.skillMarkdown != null && detail.skillMarkdown.length > 0;

  const cues = buildNextSteps({
    verifier,
    skeptic,
    evaluationState,
    hasSkill,
    traceCount: detail.traces.length,
    t,
  });

  const evaluation =
    evaluationState.status === "ready" ? evaluationState.evaluation : null;

  return (
    <div className="overview-panel">
      <section className="overview-audit" aria-label={t("overview.qualityTitle")}>
        <div className="overview-quality-grid">
          <div className="overview-readout">
            <span className="overview-readout-label">{t("overview.verdictLabel")}</span>
            <span
              data-testid="overview-verdict"
              className={`overview-readout-value ${verifierPass ? "overview-verdict-pass" : "overview-verdict-fail"}`}
            >
              {verifier ? (verifierPass ? t("badge.pass") : t("badge.fail")) : "—"}
            </span>
          </div>
          <div className="overview-readout">
            <span className="overview-readout-label">{t("overview.skepticLabel")}</span>
            <span
              data-testid="overview-skeptic-score"
              className={`overview-readout-value ${skepticScoreToneClass(skepticScore)}`}
            >
              {skeptic ? `${Math.round(skepticScore * 100)}%` : "—"}
            </span>
          </div>
        </div>
        <p className="overview-grounding">
          {t("overview.grounding", {
            claims: claimCount,
            evidence: evidenceItems,
            sessions: sessionCount,
          })}
        </p>
        <dl
          className="overview-audit-summary"
          data-testid="overview-audit-summary"
        >
          <OverviewTile
            testid="overview-metric-claims"
            label={t("overview.metric.claims")}
            value={claimCount}
          />
          <OverviewTile
            testid="overview-metric-issues"
            label={t("overview.metric.issues")}
            value={issueCount}
            tone={issueCount > 0 ? "warning" : "neutral"}
          />
          <OverviewTile
            testid="overview-metric-fabricated"
            label={t("overview.metric.fabricated")}
            value={fabricated}
            tone={fabricated > 0 ? "danger" : "neutral"}
          />
          <OverviewTile
            testid="overview-metric-evidence"
            label={t("overview.metric.evidence")}
            value={evidenceItems}
          />
        </dl>
      </section>

      <section className="s2s-card overview-next" aria-label={t("overview.nextTitle")}>
        <div className="overview-next-header">
          <h3>{t("overview.nextTitle")}</h3>
          <p className="overview-next-help">{t("overview.nextHelp")}</p>
        </div>
        <ul className="overview-next-list">
          {cues.map((cue) => (
            <li key={cue.id}>
              <button
                type="button"
                data-testid={`overview-cue-${cue.id}`}
                className={`overview-cue overview-cue-${cue.tone}`}
                onClick={() =>
                  cue.action === "evaluate"
                    ? onEvaluate()
                    : onNavigate(cue.target ?? "overview")
                }
              >
                <span className="overview-cue-dot" aria-hidden="true" />
                <span className="overview-cue-text">{cue.message}</span>
                <span className="overview-cue-go">
                  {cue.action === "evaluate" ? t("overview.cue.run") : t("overview.cue.go")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="s2s-card overview-issues" aria-label={t("overview.issuesPreviewTitle")}>
        <div className="overview-section-header">
          <h3>{t("overview.issuesPreviewTitle")}</h3>
          <button
            type="button"
            className="s2s-btn s2s-btn-ghost"
            onClick={() => onNavigate("reports")}
          >
            {t("overview.viewAllReports")}
          </button>
        </div>
        {!skeptic || skeptic.issues.length === 0 ? (
          <p className="overview-muted">{t("overview.noIssuesPreview")}</p>
        ) : (
          <ul className="overview-issues-list">
            {topIssues(skeptic.issues).map((issue, idx) => (
              <li
                key={`${issue.claimId}-${issue.problemType}-${idx}`}
                className="overview-issue"
              >
                <span className={severityBadgeClass(issue.severity)}>
                  {tEnum("severity", issue.severity)}
                </span>
                <span className="overview-issue-type">{issue.problemType}</span>
                <span className="overview-issue-detail">{issue.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {evaluation && (
        <section className="s2s-card" aria-label={t("overview.scorecardTitle")}>
          <div className="overview-section-header">
            <h3>{t("overview.scorecardTitle")}</h3>
          </div>
          <ScoreCard evaluation={evaluation} />
        </section>
      )}

      <EvaluateCard evaluationState={evaluationState} onEvaluate={onEvaluate} />
    </div>
  );
}

function EvaluateCard({
  evaluationState,
  onEvaluate,
}: {
  evaluationState: EvaluationState;
  onEvaluate: () => void;
}): JSX.Element {
  const { t } = useLocale();
  return (
    <section className="s2s-card evaluate-card">
      <div className="evaluate-card-header">
        <h3>{t("detail.evaluateTitle")}</h3>
        <button
          type="button"
          data-testid="evaluate-button"
          onClick={onEvaluate}
          disabled={evaluationState.status === "pending"}
          className="s2s-btn s2s-btn-primary"
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
        <div className="evaluate-card-result">
          <div>{t("detail.verdict")}: {evaluationState.evaluation.verdict}</div>
          <div>{t("detail.gates")}: {evaluationState.evaluation.gates.lint}/{evaluationState.evaluation.gates.redaction}/{evaluationState.evaluation.gates.grounding}</div>
        </div>
      )}
    </section>
  );
}

function OverviewTile({
  testid,
  label,
  value,
  tone = "neutral",
}: {
  testid: string;
  label: string;
  value: number;
  tone?: "neutral" | "warning" | "danger";
}): JSX.Element {
  return (
    <div
      className={`overview-tile overview-tile-${tone}`}
      data-testid={testid}
    >
      <dt className="overview-tile-label">{label}</dt>
      <dd className="overview-tile-value">{value}</dd>
    </div>
  );
}

type NextStepsArgs = {
  verifier: RunDetail["verifierReport"];
  skeptic: RunDetail["skepticReport"];
  evaluationState: EvaluationState;
  hasSkill: boolean;
  traceCount: number;
  t: ReturnType<typeof useLocale>["t"];
};

function buildNextSteps({
  verifier,
  skeptic,
  evaluationState,
  hasSkill,
  traceCount,
  t,
}: NextStepsArgs): NextStepCue[] {
  const cues: NextStepCue[] = [];
  const issues = skeptic?.issues ?? [];
  const high = issues.filter((i) => i.severity === "high").length;
  const medium = issues.filter((i) => i.severity === "medium").length;
  const fabricated = verifier?.metadata.fabricatedCount ?? 0;
  const verifierPass = verifier?.pass ?? false;

  if (!verifier) {
    cues.push({
      id: "verifier-missing",
      tone: "warning",
      message: t("overview.cue.verifierMissing"),
      target: "reports",
    });
  } else if (!verifierPass || fabricated > 0) {
    cues.push({
      id: "verifier-failed",
      tone: "danger",
      message: t("overview.cue.verifierFailed", { n: fabricated }),
      target: "reports",
    });
  }

  if (high > 0) {
    cues.push({
      id: "high-issues",
      tone: "danger",
      message: t("overview.cue.highIssues", { n: high }),
      target: "reports",
    });
  }
  if (medium > 0) {
    cues.push({
      id: "medium-issues",
      tone: "warning",
      message: t("overview.cue.mediumIssues", { n: medium }),
      target: "reports",
    });
  }

  const clean = Boolean(verifier) && verifierPass && high + medium === 0 && fabricated === 0;

  if (hasSkill) {
    cues.push({
      id: "review-skill",
      tone: clean ? "success" : "accent",
      message: clean ? t("overview.cue.allClear") : t("overview.cue.reviewSkill"),
      target: "preview",
    });
  }

  if (evaluationState.status !== "ready") {
    cues.push({
      id: "evaluate",
      tone: "accent",
      message: t("overview.cue.evaluate"),
      action: "evaluate",
    });
  }

  if (traceCount > 0) {
    cues.push({
      id: "traces",
      tone: "neutral",
      message: t("overview.cue.traces", { n: traceCount }),
      target: "preview",
    });
  }

  if (cues.length === 0) {
    cues.push({
      id: "all-clear",
      tone: "success",
      message: t("overview.cue.allClear"),
      target: "preview",
    });
  }

  return cues;
}

const SEVERITY_RANK: Record<SkepticIssue["severity"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function topIssues(issues: SkepticIssue[], limit = 3): SkepticIssue[] {
  return [...issues]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, limit);
}

function severityBadgeClass(severity: SkepticIssue["severity"]): string {
  if (severity === "high") return "s2s-badge s2s-badge-danger";
  if (severity === "medium") return "s2s-badge s2s-badge-warning";
  return "s2s-badge s2s-badge-accent";
}

function skepticScoreToneClass(score: number): string {
  if (score >= 0.8) return "overview-score-good";
  if (score >= 0.5) return "overview-score-warning";
  return "overview-score-danger";
}

function stageToTab(stage: "analyst" | "skeptic" | "writer" | "verifier"): Tab {
  switch (stage) {
    case "analyst":
      return "claims";
    case "skeptic":
      return "reports";
    case "writer":
      return "preview";
    case "verifier":
      return "reports";
  }
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
    <div className={`detail-shell-state detail-shell-state-${tone}`}>
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
