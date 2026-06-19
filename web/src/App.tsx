import { useEffect, useState, type JSX } from "react";

import {
  type GenerateRunRequest,
  type GenerationProgress,
  type RunSummary,
} from "./runs.js";
import type { SessionSelection } from "./components/SessionBrowser.js";
import { useRunsQuery, useGenerateMutation, useSessionsQuery, useGenerationProgress } from "./hooks/useQueries.js";
import { DocsPage } from "./components/DocsPage.js";
import { RunDetailPage } from "./components/RunDetailPage.js";
import { ProviderPicker } from "./components/ProviderPicker.js";
import { SessionBrowser } from "./components/SessionBrowser.js";
import { LanguageToggle } from "./i18n/LanguageToggle.js";
import { useLocale } from "./i18n/LocaleContext.js";
import "./styles.css";

type GenerateState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "running"; runName: string }
  | { status: "success"; runName: string }
  | { status: "error"; message: string };

export function App(): JSX.Element {
  const { t } = useLocale();
  const { data: runs, isLoading, error: runsError } = useRunsQuery();
  const [selectedRun, setSelectedRun] = useState<string | null>(() =>
    getInitialSelectedRun(),
  );
  const [showDocs, setShowDocs] = useState(false);
  const [generateSuccessName, setGenerateSuccessName] = useState<string | null>(null);
  const [generateErrorMessage, setGenerateErrorMessage] = useState<string | null>(null);
  const [runningRunName, setRunningRunName] = useState<string | null>(null);

  const generateMutation = useGenerateMutation();
  const { data: progress } = useGenerationProgress(
    runningRunName,
    runningRunName !== null,
  );

  useEffect(() => {
    if (!progress || !runningRunName) return;
    if (progress.stage === "done") {
      setRunningRunName(null);
      setGenerateSuccessName(runningRunName);
    } else if (progress.stage === "no-claims") {
      setRunningRunName(null);
      setGenerateSuccessName(runningRunName);
    } else if (progress.stage === "error") {
      setRunningRunName(null);
      setGenerateErrorMessage(progress.error ?? "Generation failed");
    }
  }, [progress, runningRunName]);

  const generateState: GenerateState = runningRunName
    ? { status: "running", runName: runningRunName }
    : generateMutation.isPending
      ? { status: "pending" }
      : generateSuccessName
        ? { status: "success", runName: generateSuccessName }
        : generateErrorMessage
          ? { status: "error", message: generateErrorMessage }
          : { status: "idle" };

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
    setGenerateSuccessName(null);
    setGenerateErrorMessage(null);
    setRunningRunName(null);
    try {
      const result = await generateMutation.mutateAsync(request);
      setRunningRunName(result.name);
    } catch (err: unknown) {
      setGenerateErrorMessage(
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  if (showDocs) {
    return (
      <DocsPage onBack={() => setShowDocs(false)} />
    );
  }

  if (selectedRun) {
    return (
      <RunDetailPage
        runName={selectedRun}
        onBack={closeRun}
      />
    );
  }

  const runsErrorMessage = runsError instanceof Error ? runsError.message : runsError ? String(runsError) : null;

  if (isLoading) {
    return <Shell onShowDocs={() => setShowDocs(true)}>{t("app.loading")}</Shell>;
  }

  if (runsErrorMessage) {
    return (
      <Shell style={{ color: "#c0392b" }} onShowDocs={() => setShowDocs(true)}>
        {t("app.errorPrefix", { message: runsErrorMessage })}
      </Shell>
    );
  }

  const readyRuns = runs ?? [];

  if (readyRuns.length === 0) {
    return <Shell onShowDocs={() => setShowDocs(true)}>{t("app.noRuns")}</Shell>;
  }

  return (
    <Shell onShowDocs={() => setShowDocs(true)}>
      <RunsDashboard
        runs={readyRuns}
        generateState={generateState}
        progress={progress}
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
  progress,
  onGenerate = () => undefined,
  onSelect,
}: {
  runs: RunSummary[];
  generateState?: GenerateState;
  progress?: GenerationProgress | null;
  onGenerate?: (request: GenerateRunRequest) => void | Promise<void>;
  onSelect: (name: string) => void;
}): JSX.Element {
  const { t } = useLocale();
  const summary = summarizeRuns(runs);

  return (
    <main className="runs-dashboard" aria-label={t("dashboard.label")} data-testid="run-dashboard">
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
        progress={progress}
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

type SessionSelectionStepProps = {
  selectedAdapter: string | null;
  onAdapterChange: (adapter: string) => void;
  selectedSessions: SessionSelection[];
  onSessionsChange: (selections: SessionSelection[]) => void;
  directory: string;
};

function SessionSelectionStep({
  selectedAdapter,
  onAdapterChange,
  selectedSessions,
  onSessionsChange,
  directory,
}: SessionSelectionStepProps): JSX.Element {
  const { data: sessionsData } = useSessionsQuery(
    selectedAdapter,
    directory,
  );

  return (
    <>
      <div style={{ gridColumn: "1 / -1" }}>
        <ProviderPicker
          value={selectedAdapter ?? "all"}
          onChange={onAdapterChange}
        />
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <SessionBrowser
          sessions={sessionsData ?? []}
          selected={selectedSessions}
          onChange={onSessionsChange}
        />
      </div>
    </>
  );
}

function GenerateRunPanel({
  generateState,
  progress,
  onGenerate,
}: {
  generateState: GenerateState;
  progress?: GenerationProgress | null;
  onGenerate: (request: GenerateRunRequest) => void | Promise<void>;
}): JSX.Element {
  const { t } = useLocale();
  const [name, setName] = useState("");
  const [recent, setRecent] = useState("10");
  const [tone, setTone] = useState<NonNullable<GenerateRunRequest["tone"]>>("balanced");
  const [template, setTemplate] = useState<NonNullable<GenerateRunRequest["template"]>>("claude-skill");
  const [skillType, setSkillType] = useState<NonNullable<GenerateRunRequest["skillType"]>>("workflow");
  const [force, setForce] = useState(false);
  const [evidenceBudget, setEvidenceBudget] = useState("160000");
  const [evidenceMaxChars, setEvidenceMaxChars] = useState("5000");
  const [evidenceMaxItems, setEvidenceMaxItems] = useState("3000");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSessionSelection, setShowSessionSelection] = useState(false);
  const [selectedAdapter, setSelectedAdapter] = useState<string | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<SessionSelection[]>([]);
  const [directory] = useState(".");
  const pending = generateState.status === "pending" || generateState.status === "running";
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const request: GenerateRunRequest = {
      name: name.trim() || undefined,
      ...(selectedSessions.length > 0
        ? { sessionSelections: selectedSessions }
        : { recent: Number.parseInt(recent, 10) || 10 }),
      tone,
      template,
      skillType,
      force,
      evidenceConfig: {
        tokenBudget: Number.parseInt(evidenceBudget, 10) || 160000,
        maxChars: Number.parseInt(evidenceMaxChars, 10) || 5000,
        maxItems: Number.parseInt(evidenceMaxItems, 10) || 3000,
      },
    };
    void onGenerate(request);
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
          <button
            type="button"
            className="generate-advanced-toggle"
            onClick={() => setShowSessionSelection(!showSessionSelection)}
            aria-expanded={showSessionSelection}
            style={{ gridColumn: "1 / -1", justifySelf: "start" }}
          >
            {showSessionSelection ? "▾" : "▸"} Session Selection
          </button>
          {showSessionSelection && (
            <SessionSelectionStep
              selectedAdapter={selectedAdapter}
              onAdapterChange={(value) => {
                setSelectedAdapter(value);
                setSelectedSessions([]);
              }}
              selectedSessions={selectedSessions}
              onSessionsChange={setSelectedSessions}
              directory={directory}
            />
          )}
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
          <label htmlFor="generate-template">
            <span>{t("generate.template")}</span>
            <select
              id="generate-template"
              aria-label={t("generate.template")}
              value={template}
              onChange={(event) =>
                setTemplate(event.currentTarget.value as NonNullable<GenerateRunRequest["template"]>)
              }
            >
            <option value="claude-skill">{t("generate.template.claude-skill")}</option>
            <option value="opencode-skill">{t("generate.template.opencode-skill")}</option>
            <option value="cursor-mdc">{t("generate.template.cursor-mdc")}</option>
            <option value="copilot-instructions">{t("generate.template.copilot-instructions")}</option>
          </select>
          </label>
          <label htmlFor="generate-skill-type">
            <span>{t("generate.skillType")}</span>
            <select
              id="generate-skill-type"
              aria-label={t("generate.skillType")}
              value={skillType}
              onChange={(event) =>
                setSkillType(event.currentTarget.value as NonNullable<GenerateRunRequest["skillType"]>)
              }
            >
            <option value="workflow">{t("generate.skillType.workflow")}</option>
            <option value="testing">{t("generate.skillType.testing")}</option>
            <option value="code-style">{t("generate.skillType.code-style")}</option>
            <option value="debugging">{t("generate.skillType.debugging")}</option>
            <option value="review">{t("generate.skillType.review")}</option>
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
          <button
            type="button"
            className="generate-advanced-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
            aria-expanded={showAdvanced}
          >
            {showAdvanced ? "▾" : "▸"} Advanced
          </button>
          {showAdvanced && (
            <>
              <label htmlFor="generate-evidence-budget">
                <span>Evidence Token Budget</span>
                <input
                  id="generate-evidence-budget"
                  aria-label="Evidence Token Budget"
                  type="number"
                  min="1000"
                  step="1000"
                  value={evidenceBudget}
                  onChange={(event) => setEvidenceBudget(event.currentTarget.value)}
                />
              </label>
              <label htmlFor="generate-evidence-max-chars">
                <span>Max Chars Per Evidence</span>
                <input
                  id="generate-evidence-max-chars"
                  aria-label="Max Chars Per Evidence"
                  type="number"
                  min="100"
                  step="100"
                  value={evidenceMaxChars}
                  onChange={(event) => setEvidenceMaxChars(event.currentTarget.value)}
                />
              </label>
              <label htmlFor="generate-evidence-max-items">
                <span>Max Evidence Items</span>
                <input
                  id="generate-evidence-max-items"
                  aria-label="Max Evidence Items"
                  type="number"
                  min="10"
                  step="10"
                  value={evidenceMaxItems}
                  onChange={(event) => setEvidenceMaxItems(event.currentTarget.value)}
                />
              </label>
            </>
          )}
          <button type="submit" disabled={pending} className="generate-submit">
            {pending ? t("generate.pending") : t("generate.submit")}
          </button>
        </div>
      </form>
      {generateState.status === "running" && progress && (
        <ProgressStepper progress={progress} />
      )}
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

const HARNESS_STAGES = ["analyst", "skeptic", "writer", "verifier"] as const;

function ProgressStepper({ progress }: { progress: GenerationProgress }): JSX.Element {
  const { t } = useLocale();
  const completedSet = new Set(progress.completedStages);

  return (
    <div className="progress-stepper" data-testid="progress-stepper" role="status" aria-live="polite">
      {HARNESS_STAGES.map((stage, index) => {
        const isCompleted = completedSet.has(stage);
        const isCurrent = progress.stage === stage;
        const label = t(`progress.${stage}`);

        return (
          <div key={stage} className="progress-step-wrapper">
            {index > 0 && (
              <div className={`progress-connector ${isCompleted || isCurrent ? "active" : ""}`} />
            )}
            <div
              className={`progress-step ${isCompleted ? "completed" : isCurrent ? "current" : "pending"}`}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span className="progress-step-icon">
                {isCompleted ? "✓" : isCurrent ? "●" : ""}
              </span>
              <span className="progress-step-label">{label}</span>
            </div>
          </div>
        );
      })}
      {progress.stage === "done" && (
        <p className="generate-message">{t("progress.completed")}</p>
      )}
      {progress.stage === "no-claims" && (
        <p className="generate-message" style={{ color: "#d4a017" }}>
          Completed but no claims extracted from sessions.
        </p>
      )}
      {progress.stage === "error" && (
        <p className="generate-message error">
          {t("progress.failed", { message: progress.error ?? "" })}
        </p>
      )}
    </div>
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
  onShowDocs,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onShowDocs?: () => void;
}): JSX.Element {
  const { t } = useLocale();
  return (
    <div className="app-shell" style={style}>
      <div className="app-header">
        <h1>{t("app.title")}</h1>
        <div className="app-header-actions">
          {onShowDocs && (
            <button
              type="button"
              onClick={onShowDocs}
              className="docs-button"
            >
              {t("docs.button")}
            </button>
          )}
          <LanguageToggle />
        </div>
      </div>
      {children}
    </div>
  );
}
