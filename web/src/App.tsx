import { useEffect, useState } from "react";

import { fetchRuns, type RunSummary } from "./runs.js";
import { RunDetailPage } from "./components/RunDetailPage.js";
import { LanguageToggle } from "./i18n/LanguageToggle.js";
import { useLocale } from "./i18n/LocaleContext.js";
import "./styles.css";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; runs: RunSummary[] };

export function App(): JSX.Element {
  const { t } = useLocale();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRuns()
      .then((runs) => {
        if (!cancelled) {
          setState({ status: "ready", runs });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (selectedRun) {
    return (
      <RunDetailPage
        runName={selectedRun}
        onBack={() => setSelectedRun(null)}
      />
    );
  }

  if (state.status === "loading") {
    return <Shell>{t("app.loading")}</Shell>;
  }

  if (state.status === "error") {
    return (
      <Shell style={{ color: "#c0392b" }}>
        {t("app.errorPrefix", { message: state.message })}
      </Shell>
    );
  }

  if (state.runs.length === 0) {
    return <Shell>{t("app.noRuns")}</Shell>;
  }

  return (
    <Shell>
      <RunsDashboard
        runs={state.runs}
        onSelect={(name) => setSelectedRun(name)}
      />
    </Shell>
  );
}

export function RunsDashboard({
  runs,
  onSelect,
}: {
  runs: RunSummary[];
  onSelect: (name: string) => void;
}): JSX.Element {
  const { t } = useLocale();
  const summary = summarizeRuns(runs);

  return (
    <main className="runs-dashboard" aria-label={t("dashboard.label")}>
      <section className="dashboard-summary" aria-label={t("dashboard.summary")}>
        <MetricCard label={t("dashboard.totalRuns")} value={summary.totalRuns} />
        <MetricCard
          label={t("dashboard.verifierFailures")}
          value={summary.verifierFailures}
          tone={summary.verifierFailures > 0 ? "danger" : "good"}
        />
        <MetricCard
          label={t("dashboard.totalIssues")}
          value={summary.totalIssues}
          tone={summary.totalIssues > 0 ? "warning" : "good"}
        />
        <MetricCard
          label={t("dashboard.averageSkepticScore")}
          value={summary.averageSkepticScore.toFixed(2)}
          tone={scoreTone(summary.averageSkepticScore)}
        />
      </section>

      <section className="runs-panel" aria-label={t("dashboard.runsList")}>
        <div className="runs-panel-header">
          <div>
            <h2>{t("dashboard.runsList")}</h2>
            <p>{t("dashboard.runsHelp")}</p>
          </div>
          <span className="runs-count">
            {t("dashboard.runCount", { count: runs.length })}
          </span>
        </div>

        <div className="runs-table-wrap">
          <table className="runs-table">
            <thead>
              <tr>
                <th>{t("runTable.name")}</th>
                <th>{t("runTable.model")}</th>
                <th>{t("runTable.generatedAt")}</th>
                <th>{t("runTable.verifier")}</th>
                <th>{t("runTable.claims")}</th>
                <th>{t("runTable.skepticScore")}</th>
                <th>{t("runTable.issues")}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr
                  key={run.name}
                  className={run.verifierPassed ? "run-row" : "run-row is-failed"}
                  onClick={() => onSelect(run.name)}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(run.name);
                    }
                  }}
                >
                  <td>
                    <div className="run-name">{run.name}</div>
                  </td>
                  <td>{run.model}</td>
                  <td>
                    <time dateTime={run.generatedAt}>
                      {formatGeneratedAt(run.generatedAt)}
                    </time>
                  </td>
                  <td>
                    <Badge pass={run.verifierPassed} />
                  </td>
                  <td>{run.claimCount}</td>
                  <td>
                    <ScorePill score={run.skepticScore} />
                  </td>
                  <td>
                    <IssuePill count={run.skepticIssueCount} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Badge({ pass }: { pass: boolean }): JSX.Element {
  const { t } = useLocale();
  return (
    <span className={pass ? "status-badge pass" : "status-badge fail"}>
      {pass ? t("badge.pass") : t("badge.fail")}
    </span>
  );
}

function MetricCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "good" | "warning" | "danger";
}): JSX.Element {
  return (
    <div className={`metric-card metric-${tone}`}>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

function ScorePill({ score }: { score: number }): JSX.Element {
  return (
    <span className={`score-pill score-${scoreTone(score)}`}>
      {score.toFixed(2)}
    </span>
  );
}

function IssuePill({ count }: { count: number }): JSX.Element {
  return (
    <span className={count > 0 ? "issue-pill has-issues" : "issue-pill"}>
      {count}
    </span>
  );
}

function summarizeRuns(runs: RunSummary[]): {
  totalRuns: number;
  verifierFailures: number;
  totalIssues: number;
  averageSkepticScore: number;
} {
  const totalIssues = runs.reduce(
    (sum, run) => sum + run.skepticIssueCount,
    0,
  );
  const scoreTotal = runs.reduce((sum, run) => sum + run.skepticScore, 0);
  return {
    totalRuns: runs.length,
    verifierFailures: runs.filter((run) => !run.verifierPassed).length,
    totalIssues,
    averageSkepticScore: runs.length === 0 ? 0 : scoreTotal / runs.length,
  };
}

function scoreTone(score: number): "good" | "warning" | "danger" {
  if (score >= 0.8) return "good";
  if (score >= 0.6) return "warning";
  return "danger";
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Shell({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}): JSX.Element {
  const { t } = useLocale();
  return (
    <div className="app-shell" style={style}>
      <div className="app-header">
        <h1>{t("app.title")}</h1>
        <LanguageToggle />
      </div>
      {children}
    </div>
  );
}
