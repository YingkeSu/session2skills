import { useEffect, useState } from "react";

import {
  createRun,
  fetchRuns,
  type GenerateRunRequest,
  type RunSummary,
} from "./runs.js";
import { RunDetailPage } from "./components/RunDetailPage.js";
import { LanguageToggle } from "./i18n/LanguageToggle.js";
import { useLocale } from "./i18n/LocaleContext.js";
import "./styles.css";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; runs: RunSummary[] };

type GenerateState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; runName: string }
  | { status: "error"; message: string };

export function App(): JSX.Element {
  const { t } = useLocale();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [generateState, setGenerateState] = useState<GenerateState>({
    status: "idle",
  });
  const [selectedRun, setSelectedRun] = useState<string | null>(() =>
    getInitialSelectedRun(),
  );

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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onPopState = (): void => {
      setSelectedRun(resolveSelectedRunFromLocation(window.location));
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const currentRun = resolveSelectedRunFromLocation(window.location);
    if (currentRun === selectedRun) return;

    const url = buildSelectedRunUrl(window.location, selectedRun);
    if (selectedRun === null) {
      window.history.replaceState({ run: null }, "", url);
      return;
    }

    window.history.pushState({ run: selectedRun }, "", url);
  }, [selectedRun]);

  const closeRun = (): void => {
    if (
      typeof window !== "undefined" &&
      window.history.state?.run === selectedRun
    ) {
      window.history.back();
      return;
    }
    setSelectedRun(null);
  };

  const handleGenerate = async (request: GenerateRunRequest): Promise<void> => {
    setGenerateState({ status: "pending" });
    try {
      const generated = await createRun(request);
      setGenerateState({ status: "success", runName: generated.name });
      setState((current) => {
        if (current.status !== "ready") {
          return current;
        }
        const remaining = current.runs.filter((run) => run.name !== generated.name);
        return { status: "ready", runs: [generated, ...remaining] };
      });
    } catch (err: unknown) {
      setGenerateState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (selectedRun) {
    return (
      <RunDetailPage
        runName={selectedRun}
        onBack={closeRun}
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
        generateState={generateState}
        onGenerate={handleGenerate}
        onSelect={(name) => setSelectedRun(name)}
      />
    </Shell>
  );
}

export function resolveSelectedRunFromLocation({
  search,
  hash,
}: Pick<Location, "search" | "hash">): string | null {
  const queryRun = new URLSearchParams(search).get("run");
  if (queryRun) return queryRun;

  return parseRunFromHash(hash);
}

function getInitialSelectedRun(): string | null {
  if (typeof window === "undefined") return null;
  return resolveSelectedRunFromLocation(window.location);
}

function parseRunFromHash(hash: string): string | null {
  if (!hash) return null;

  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalized) return null;

  const hashParams = new URLSearchParams(
    normalized.startsWith("?") ? normalized.slice(1) : normalized,
  );
  return hashParams.get("run") || null;
}

export function buildSelectedRunUrl(
  locationLike: Pick<Location, "pathname" | "search">,
  run: string | null,
): string {
  const params = new URLSearchParams(locationLike.search);
  if (run) {
    params.set("run", run);
  } else {
    params.delete("run");
  }

  const query = params.toString();
  return query ? `${locationLike.pathname}?${query}` : locationLike.pathname;
}

export function RunsDashboard({
  runs,
  generateState = { status: "idle" },
  onGenerate = () => undefined,
  onSelect,
}: {
  runs: RunSummary[];
  generateState?: GenerateState;
  onGenerate?: (request: GenerateRunRequest) => void | Promise<void>;
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

      <GenerateRunPanel
        generateState={generateState}
        onGenerate={onGenerate}
      />

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
                <th>{t("runTable.artifacts")}</th>
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
                    <ArtifactStatus run={run} />
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

function GenerateRunPanel({
  generateState,
  onGenerate,
}: {
  generateState: GenerateState;
  onGenerate: (request: GenerateRunRequest) => void | Promise<void>;
}): JSX.Element {
  const { t } = useLocale();
  const [name, setName] = useState("");
  const [recent, setRecent] = useState("10");
  const [tone, setTone] = useState<NonNullable<GenerateRunRequest["tone"]>>("balanced");
  const [force, setForce] = useState(false);
  const pending = generateState.status === "pending";
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void onGenerate({
      name: name.trim() || undefined,
      recent: Number.parseInt(recent, 10) || 10,
      tone,
      force,
    });
  };

  return (
    <section className="generate-panel" aria-label={t("generate.title")}>
      <div className="generate-panel-header">
        <div>
          <h2>{t("generate.title")}</h2>
          <p>{t("generate.help")}</p>
        </div>
      </div>
      <form className="generate-form" onSubmit={handleSubmit}>
        <div className="generate-grid">
          <label htmlFor="generate-run-name">
            <span>{t("generate.name")}</span>
            <input
              id="generate-run-name"
              aria-label={t("generate.name")}
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              placeholder={t("generate.namePlaceholder")}
            />
          </label>
          <label htmlFor="generate-recent">
            <span>{t("generate.recent")}</span>
            <input
              id="generate-recent"
              aria-label={t("generate.recent")}
              type="number"
              min="1"
              value={recent}
              onChange={(event) => setRecent(event.currentTarget.value)}
            />
          </label>
          <label htmlFor="generate-tone">
            <span>{t("generate.tone")}</span>
            <select
              id="generate-tone"
              aria-label={t("generate.tone")}
              value={tone}
              onChange={(event) =>
                setTone(event.currentTarget.value as NonNullable<GenerateRunRequest["tone"]>)
              }
            >
            <option value="concise">{t("generate.tone.concise")}</option>
            <option value="balanced">{t("generate.tone.balanced")}</option>
            <option value="detailed">{t("generate.tone.detailed")}</option>
          </select>
          </label>
          <label className="generate-checkbox" htmlFor="generate-force">
            <input
              id="generate-force"
              aria-label={t("generate.force")}
              type="checkbox"
              checked={force}
              onChange={(event) => setForce(event.currentTarget.checked)}
            />
            <span>{t("generate.force")}</span>
          </label>
          <button type="submit" disabled={pending} className="generate-submit">
            {pending ? t("generate.pending") : t("generate.submit")}
          </button>
        </div>
      </form>
      {generateState.status === "error" && (
        <p className="generate-message error">
          {t("generate.error", { message: generateState.message })}
        </p>
      )}
      {generateState.status === "success" && (
        <p className="generate-message">
          {t("generate.success", { name: generateState.runName })}
        </p>
      )}
    </section>
  );
}

function ArtifactStatus({ run }: { run: RunSummary }): JSX.Element {
  const { t } = useLocale();
  const status = run.artifactStatus ?? "complete";
  return (
    <div className="artifact-status">
      <span className={`artifact-pill artifact-${status}`}>
        {t(`artifact.${status}`)}
      </span>
      <span>
        {run.skillAvailable === false ? t("artifact.noSkill") : "SKILL.md"}
      </span>
      <span>
        {run.summaryAvailable === false ? t("artifact.noSummary") : t("artifact.summary")}
      </span>
    </div>
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
