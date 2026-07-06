import { useEffect, useState, type JSX } from "react";

import {
  type GenerateRunRequest,
  type GenerationProgress,
  type RunSummary,
} from "./runs.js";
import type { SessionSelection } from "./components/SessionBrowser.js";
import { useRunsQuery, useGenerateMutation, useSessionsQuery, useGenerationProgress, useAdaptersQuery, useProjectsQuery, useUpdateRunMetaMutation, useDeleteRunMutation } from "./hooks/useQueries.js";
import { DocsPage } from "./components/DocsPage.js";
import { RunDetailPage } from "./components/RunDetailPage.js";
import { ProviderPicker } from "./components/ProviderPicker.js";
import { ProjectPicker } from "./components/ProjectPicker.js";
import { SessionBrowser } from "./components/SessionBrowser.js";
import { LanguageToggle } from "./i18n/LanguageToggle.js";
import { useLocale } from "./i18n/LocaleContext.js";
import "./styles.css";

/**
 * Built-in OpenAI-compatible provider presets for the generate panel. Mirrors
 * the backend `LLM_PROVIDER_PRESETS` in `src/llm/selection.ts`. The first entry
 * (empty id) means "use the server's env-configured default". Presets only seed
 * provider id + base URL; the model and API key are always user-supplied.
 */
const LLM_PRESETS = [
  { id: "", label: "Server default", provider: "", baseUrl: "" },
  { id: "openai", label: "OpenAI", provider: "openai", baseUrl: "https://api.openai.com/v1" },
  { id: "openrouter", label: "OpenRouter", provider: "openrouter", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "deepseek", label: "DeepSeek", provider: "deepseek", baseUrl: "https://api.deepseek.com/v1" },
  { id: "zhipuai", label: "ZhipuAI (GLM)", provider: "zhipuai", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  { id: "ollama", label: "Ollama", provider: "ollama", baseUrl: "http://localhost:11434/v1" },
  { id: "litellm", label: "LiteLLM", provider: "litellm", baseUrl: "http://localhost:4000/v1" },
  { id: "openai-compatible", label: "OpenAI-compatible (custom)", provider: "openai-compatible", baseUrl: "" },
] as const;

type GenerateState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "running"; runName: string }
  | { status: "success"; runName: string }
  | { status: "error"; message: string };

/**
 * Select value for the "runs with no group" filter option. A sentinel string
 * keeps the `<select>` value uniformly a string while still distinguishing
 * "ungrouped" from "all groups" (the empty string).
 */
const UNGROUPED_FILTER = "__none__";

/**
 * Per-run management handlers wired in `App` (which owns the react-query
 * mutations) and forwarded into `RunsDashboard` → `RunDetailPreview`. Kept as
 * plain callbacks so `RunsDashboard` can render without a QueryClient (the
 * static-markup tests mount it standalone).
 */
type RunManagement = {
  onUpdateGroup: (name: string, group: string | null) => void | Promise<void>;
  onToggleArchived: (name: string, archived: boolean) => void | Promise<void>;
  onDelete: (name: string) => void | Promise<void>;
  metaPending: boolean;
  deletePending: boolean;
  errorMessage: string | null;
};

export function App(): JSX.Element {
  const { t } = useLocale();
  // Archive visibility is App-level state because it changes which endpoint
  // variant the runs query hits (includeArchived=true), not just client filter.
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data: runs, isLoading, error: runsError } = useRunsQuery(includeArchived);
  const [selectedRun, setSelectedRun] = useState<string | null>(() =>
    getInitialSelectedRun(),
  );
  const [showDocs, setShowDocs] = useState(false);
  const [showGeneratePanel, setShowGeneratePanel] = useState(false);
  const [generateSuccessName, setGenerateSuccessName] = useState<string | null>(null);
  const [generateErrorMessage, setGenerateErrorMessage] = useState<string | null>(null);
  const [managementErrorMessage, setManagementErrorMessage] = useState<string | null>(null);
  const [runningRunName, setRunningRunName] = useState<string | null>(null);

  const generateMutation = useGenerateMutation();
  const updateMetaMutation = useUpdateRunMetaMutation();
  const deleteRunMutation = useDeleteRunMutation();
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

  const handleUpdateGroup = async (
    name: string,
    group: string | null,
  ): Promise<void> => {
    setManagementErrorMessage(null);
    try {
      await updateMetaMutation.mutateAsync({ name, patch: { group } });
    } catch (err: unknown) {
      setManagementErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggleArchived = async (
    name: string,
    archived: boolean,
  ): Promise<void> => {
    setManagementErrorMessage(null);
    try {
      await updateMetaMutation.mutateAsync({ name, patch: { archived } });
    } catch (err: unknown) {
      setManagementErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteRun = async (name: string): Promise<void> => {
    // window.confirm gate per spec; guard for non-browser (ssr/static) renders.
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        t("management.deleteConfirm", { name }),
      );
      if (!confirmed) return;
    }
    setManagementErrorMessage(null);
    try {
      await deleteRunMutation.mutateAsync(name);
    } catch (err: unknown) {
      setManagementErrorMessage(err instanceof Error ? err.message : String(err));
      return;
    }
    // If the deep-linked run was removed, drop the URL selection so the list
    // view is the landing surface again instead of a stale detail page.
    if (selectedRun === name) {
      closeRun();
    }
  };

  const runManagement: RunManagement = {
    onUpdateGroup: handleUpdateGroup,
    onToggleArchived: handleToggleArchived,
    onDelete: handleDeleteRun,
    metaPending: updateMetaMutation.isPending,
    deletePending: deleteRunMutation.isPending,
    errorMessage: managementErrorMessage,
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
      <Shell style={{ color: "var(--danger)" }} onShowDocs={() => setShowDocs(true)}>
        {t("app.errorPrefix", { message: runsErrorMessage })}
      </Shell>
    );
  }

  const readyRuns = runs ?? [];

  return (
    <Shell
      onShowDocs={() => setShowDocs(true)}
      onNewRun={() => setShowGeneratePanel((visible) => !visible)}
      newRunActive={showGeneratePanel}
    >
      <RunsDashboard
        runs={readyRuns}
        generateState={generateState}
        progress={progress}
        showGeneratePanel={showGeneratePanel}
        onGenerate={handleGenerate}
        onSelect={(name) => setSelectedRun(name)}
        includeArchived={includeArchived}
        onIncludeArchivedChange={setIncludeArchived}
        management={runManagement}
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
  showGeneratePanel = false,
  onGenerate = () => undefined,
  onSelect,
  includeArchived = false,
  onIncludeArchivedChange,
  management,
}: {
  runs: RunSummary[];
  generateState?: GenerateState;
  progress?: GenerationProgress | null;
  showGeneratePanel?: boolean;
  onGenerate?: (request: GenerateRunRequest) => void | Promise<void>;
  onSelect: (name: string) => void;
  includeArchived?: boolean;
  onIncludeArchivedChange?: (includeArchived: boolean) => void;
  management?: RunManagement;
}): JSX.Element {
  const { t } = useLocale();
  const summary = summarizeRuns(runs);
  const [previewedRun, setPreviewedRun] = useState<string | null>(null);
  // Group filter is client-side only: it narrows the visible rows without
  // touching the query. "" = all groups, UNGROUPED_FILTER = no group.
  const [groupFilter, setGroupFilter] = useState<string>("");

  const groups = deriveGroups(runs);
  const hasUngrouped = runs.some((run) => !run.group);
  const visibleRuns = filterRunsByGroup(runs, groupFilter);

  useEffect(() => {
    if (!groupFilter) return;
    if (groupFilter === UNGROUPED_FILTER) {
      if (!hasUngrouped) setGroupFilter("");
      return;
    }
    if (!groups.includes(groupFilter)) {
      setGroupFilter("");
    }
  }, [groupFilter, groups, hasUngrouped]);

  const handleRowActivate = (name: string): void => {
    setPreviewedRun(name);
    onSelect(name);
  };

  // A run is always selected when the list is non-empty: the explicit
  // preview wins, otherwise the first run is the default selection so the
  // cockpit opens with a concrete run in focus instead of an empty pane.
  const selectedRun = previewedRun
    ? runs.find((run) => run.name === previewedRun) ?? runs[0] ?? null
    : runs[0] ?? null;
  const activeName = selectedRun?.name ?? null;

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

      {showGeneratePanel && (
        <GenerateRunPanel
          generateState={generateState}
          progress={progress}
          onGenerate={onGenerate}
        />
      )}

      <div className="runs-master-detail">
        <section
          className="runs-panel runs-master-pane"
          aria-label={t("dashboard.runsList")}
        >
          <div className="runs-panel-header">
            <div>
              <h2>{t("dashboard.runsList")}</h2>
              <p>{t("dashboard.runsHelp")}</p>
            </div>
            <span className="runs-count">
              {t("dashboard.runCount", { count: visibleRuns.length })}
            </span>
          </div>

          <div
            className="runs-management-toolbar"
            role="group"
            aria-label={t("management.toolbarLabel")}
            data-testid="runs-management-toolbar"
          >
            <label className="runs-toolbar-field">
              <span>{t("management.groupFilter")}</span>
              <select
                className="s2s-select runs-filter-select"
                aria-label={t("management.groupFilter")}
                value={groupFilter}
                onChange={(event) => setGroupFilter(event.currentTarget.value)}
              >
                <option value="">{t("management.groupAll")}</option>
                {hasUngrouped && (
                  <option value={UNGROUPED_FILTER}>
                    {t("management.ungrouped")}
                  </option>
                )}
                {groups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </label>
            <label className="runs-toolbar-check">
              <input
                type="checkbox"
                className="s2s-checkbox"
                checked={includeArchived}
                onChange={(event) =>
                  onIncludeArchivedChange?.(event.currentTarget.checked)
                }
              />
              <span>{t("management.showArchived")}</span>
            </label>
          </div>

          <div className="run-list-wrap">
            <ul className="run-list" aria-label={t("dashboard.runsList")}>
              {visibleRuns.map((run) => {
                const isActive = activeName === run.name;
                return (
                  <li key={run.name} className="run-list-row-item">
                    <button
                      type="button"
                      className={
                        isActive
                          ? "run-item is-active"
                          : run.verifierPassed
                            ? "run-item"
                            : "run-item is-failed"
                      }
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => handleRowActivate(run.name)}
                    >
                      <span
                        className={`run-item-rail tone-${runQualityTone(run)}`}
                        aria-hidden="true"
                      />
                      <span className="run-item-body">
                        <span className="run-item-head">
                          <span className="run-item-name" title={run.name}>
                            {run.name}
                          </span>
                          <Badge pass={run.verifierPassed} />
                          <ScorePill
                            score={run.skepticScore}
                            label={`${t("runTable.skepticScore")} ${run.skepticScore.toFixed(2)}`}
                          />
                        </span>
                        <span className="run-item-meta">
                          <span className="run-item-context">
                            <span className="run-item-model" title={run.model}>
                              {run.model}
                            </span>
                            <span className="run-item-sep" aria-hidden="true">
                              ·
                            </span>
                            <time
                              dateTime={run.generatedAt}
                              className="run-item-time"
                            >
                              {formatGeneratedAtShort(run.generatedAt)}
                            </time>
                          </span>
                          <span className="run-item-stats">
                            {run.group ? (
                              <span
                                className="s2s-chip s2s-chip-muted run-item-group"
                                title={run.group}
                              >
                                {run.group}
                              </span>
                            ) : null}
                            {run.archived ? (
                              <span
                                className="s2s-chip s2s-chip-warning run-item-archived"
                                title={t("management.archived")}
                              >
                                {t("management.archived")}
                              </span>
                            ) : null}
                            <IssuePill
                              count={run.skepticIssueCount}
                              label={`${run.skepticIssueCount} ${t("runTable.issues")}`}
                            />
                            <span
                              className={`artifact-pill artifact-${run.artifactStatus ?? "complete"}`}
                            >
                              {t(`artifact.${run.artifactStatus ?? "complete"}`)}
                            </span>
                            <span className="run-item-claims">
                              <span className="run-item-claims-num">
                                {run.claimCount}
                              </span>
                              <span className="run-item-claims-label">
                                {t("runTable.claims")}
                              </span>
                            </span>
                            <ProgressBadge stage={run.progressStage} />
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <aside
          className="runs-detail-pane"
          data-testid="run-detail-pane"
          aria-label={t("dashboard.runDetail")}
        >
          {selectedRun ? (
            <RunDetailPreview run={selectedRun} management={management} />
          ) : (
            <div className="runs-detail-empty" data-testid="run-detail-empty">
              {t("dashboard.detailEmpty")}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function RunDetailPreview({
  run,
  management,
}: {
  run: RunSummary;
  management?: RunManagement;
}): JSX.Element {
  const { t } = useLocale();
  const [groupDraft, setGroupDraft] = useState<string>(run.group ?? "");

  // Re-seed the inline group editor whenever the focused run (or its stored
  // group) changes — e.g. after a meta patch refetches the list, or when the
  // user selects a different row.
  useEffect(() => {
    setGroupDraft(run.group ?? "");
  }, [run.name, run.group]);

  const canManage = Boolean(management);
  const metaPending = management?.metaPending ?? false;
  const deletePending = management?.deletePending ?? false;
  // Save is enabled only when the trimmed draft differs from the current
  // group; clearing a non-empty group is the Clear button's job.
  const groupChanged = groupDraft.trim() !== (run.group ?? "");

  const submitGroup = (): void => {
    const next = groupDraft.trim();
    // Empty draft becomes null so the backend clears the label rather than
    // storing an empty string.
    void management?.onUpdateGroup(run.name, next.length > 0 ? next : null);
  };

  const clearGroup = (): void => {
    setGroupDraft("");
    void management?.onUpdateGroup(run.name, null);
  };

  return (
    <div data-testid="run-detail-selected">
      <h3 className="runs-detail-selected-title">{run.name}</h3>
      <dl className="runs-detail-meta-grid">
        <div>
          <dt>{t("runTable.model")}</dt>
          <dd>{run.model}</dd>
        </div>
        <div>
          <dt>{t("runTable.generatedAt")}</dt>
          <dd>
            <time dateTime={run.generatedAt}>
              {formatGeneratedAt(run.generatedAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt>{t("runTable.verifier")}</dt>
          <dd>
            <Badge pass={run.verifierPassed} />
          </dd>
        </div>
        <div>
          <dt>{t("runTable.claims")}</dt>
          <dd>{run.claimCount}</dd>
        </div>
        <div>
          <dt>{t("runTable.skepticScore")}</dt>
          <dd>
            <ScorePill score={run.skepticScore} />
          </dd>
        </div>
        <div>
          <dt>{t("runTable.issues")}</dt>
          <dd>
            <IssuePill count={run.skepticIssueCount} />
          </dd>
        </div>
        <div>
          <dt>{t("management.group")}</dt>
          <dd>
            {run.group ? (
              <span className="s2s-chip s2s-chip-muted">{run.group}</span>
            ) : (
              <span className="overview-muted">{t("management.noGroup")}</span>
            )}
          </dd>
        </div>
        <div>
          <dt>{t("management.archived")}</dt>
          <dd>
            {run.archived ? (
              <span className="s2s-chip s2s-chip-warning">
                {run.archivedAt
                  ? t("management.archivedAt", {
                      date: formatGeneratedAt(run.archivedAt),
                    })
                  : t("management.archived")}
              </span>
            ) : (
              <span className="overview-muted">—</span>
            )}
          </dd>
        </div>
      </dl>
      <div className="runs-detail-artifacts">
        <ArtifactStatus run={run} />
      </div>
      {canManage && (
        <div className="runs-detail-management" data-testid="run-management">
          <div className="runs-management-group">
            <label
              className="runs-management-group-label"
              htmlFor="run-group-edit"
            >
              <span>{t("management.group")}</span>
            </label>
            <div className="runs-management-group-row">
              <input
                id="run-group-edit"
                className="s2s-input runs-group-input"
                autoComplete="off"
                value={groupDraft}
                onChange={(event) =>
                  setGroupDraft(event.currentTarget.value)
                }
                placeholder={t("management.groupPlaceholder")}
                disabled={metaPending}
              />
              <button
                type="button"
                className="s2s-btn s2s-btn-primary"
                onClick={submitGroup}
                disabled={metaPending || !groupChanged}
              >
                {metaPending ? t("management.saving") : t("management.saveGroup")}
              </button>
              <button
                type="button"
                className="s2s-btn s2s-btn-ghost"
                onClick={clearGroup}
                disabled={metaPending || !run.group}
              >
                {t("management.clearGroup")}
              </button>
            </div>
          </div>
          <div className="runs-management-actions">
            <button
              type="button"
              className="s2s-btn s2s-btn-ghost"
              onClick={() =>
                void management?.onToggleArchived(run.name, !run.archived)
              }
              disabled={metaPending}
            >
              {run.archived
                ? t("management.unarchive")
                : t("management.archive")}
            </button>
            <button
              type="button"
              className="s2s-btn s2s-btn-danger"
              onClick={() => void management?.onDelete(run.name)}
              disabled={deletePending}
            >
              {deletePending
                ? t("management.deletePending")
                : t("management.delete")}
            </button>
          </div>
          {management?.errorMessage && (
            <p className="runs-management-error" role="alert">
              {t("management.errorPrefix", {
                message: management?.errorMessage,
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

type SessionSelectionStepProps = {
  selectedAdapter: string | null;
  onAdapterChange: (adapter: string) => void;
  selectedSessions: SessionSelection[];
  onSessionsChange: (selections: SessionSelection[]) => void;
  directory: string;
  onDirectoryChange: (directory: string) => void;
};

function SessionSelectionStep({
  selectedAdapter,
  onAdapterChange,
  selectedSessions,
  onSessionsChange,
  directory,
  onDirectoryChange,
}: SessionSelectionStepProps): JSX.Element {
  const { t } = useLocale();
  const { data: adaptersData } = useAdaptersQuery();
  const { data: sessionsData } = useSessionsQuery(
    selectedAdapter,
    directory,
  );
  const { data: projectsData, isLoading: projectsLoading } = useProjectsQuery(
    selectedAdapter && selectedAdapter !== "all" ? selectedAdapter : null,
  );

  const sessions = sessionsData?.sessions ?? [];
  const adapterErrors = sessionsData?.adapterErrors ?? [];

  return (
    <>
      <label htmlFor="generate-directory" style={{ display: "block" }}>
        <span>{t("generate.directory")}</span>
        <ProjectPicker
          adapter={selectedAdapter}
          projects={projectsData}
          projectsLoading={projectsLoading}
          directory={directory}
          onDirectoryChange={onDirectoryChange}
        />
      </label>
      <div style={{ gridColumn: "1 / -1" }}>
        <ProviderPicker
          value={selectedAdapter ?? "all"}
          onChange={onAdapterChange}
          adapters={adaptersData}
        />
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <SessionBrowser
          sessions={sessions}
          selected={selectedSessions}
          onChange={onSessionsChange}
          adapterErrors={adapterErrors}
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
  const [showLlm, setShowLlm] = useState(false);
  const [llmPreset, setLlmPreset] = useState<string>("");
  const [llmProvider, setLlmProvider] = useState<string>("");
  const [llmBaseUrl, setLlmBaseUrl] = useState<string>("");
  const [llmModel, setLlmModel] = useState<string>("");
  const [llmApiKey, setLlmApiKey] = useState<string>("");
  const [selectedAdapter, setSelectedAdapter] = useState<string | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<SessionSelection[]>([]);
  const [directory, setDirectory] = useState(".");
  const pending = generateState.status === "pending" || generateState.status === "running";

  const handleLlmPresetChange = (presetId: string): void => {
    setLlmPreset(presetId);
    const preset = LLM_PRESETS.find((p) => p.id === presetId);
    setLlmProvider(preset?.provider ?? "");
    setLlmBaseUrl(preset?.baseUrl ?? "");
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const llmConfig: GenerateRunRequest["llmConfig"] = {};
    if (llmProvider.trim()) llmConfig.provider = llmProvider.trim();
    if (llmBaseUrl.trim()) llmConfig.baseUrl = llmBaseUrl.trim();
    if (llmModel.trim()) llmConfig.model = llmModel.trim();
    if (llmApiKey) llmConfig.apiKey = llmApiKey;
    const hasLlmConfig = Object.keys(llmConfig).length > 0;

    const request: GenerateRunRequest = {
      name: name.trim() || undefined,
      ...(directory && directory !== "." ? { directory } : {}),
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
      ...(hasLlmConfig ? { llmConfig } : {}),
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
            className="s2s-btn s2s-btn-ghost generate-advanced-toggle"
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
              onDirectoryChange={setDirectory}
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
            className="s2s-btn s2s-btn-ghost generate-advanced-toggle"
            onClick={() => setShowLlm(!showLlm)}
            aria-expanded={showLlm}
            aria-controls="generate-llm-fields"
          >
            {showLlm ? "▾" : "▸"} {t("generate.llm")}
          </button>
          {showLlm && (
            <div id="generate-llm-fields" style={{ display: "contents" }}>
              <p className="generate-help" style={{ gridColumn: "1 / -1" }}>
                {t("generate.llm.help")}
              </p>
              <label htmlFor="generate-llm-preset">
                <span>{t("generate.llm.preset")}</span>
                <select
                  id="generate-llm-preset"
                  aria-label={t("generate.llm.preset")}
                  value={llmPreset}
                  onChange={(event) => handleLlmPresetChange(event.currentTarget.value)}
                >
                  {LLM_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.id === "" ? t("generate.llm.preset.default") : preset.label}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="generate-llm-base-url">
                <span>{t("generate.llm.baseUrl")}</span>
                <input
                  id="generate-llm-base-url"
                  aria-label={t("generate.llm.baseUrl")}
                  autoComplete="off"
                  value={llmBaseUrl}
                  onChange={(event) => setLlmBaseUrl(event.currentTarget.value)}
                  placeholder="https://api.openai.com/v1"
                />
              </label>
              <label htmlFor="generate-llm-model">
                <span>{t("generate.llm.model")}</span>
                <input
                  id="generate-llm-model"
                  aria-label={t("generate.llm.model")}
                  autoComplete="off"
                  value={llmModel}
                  onChange={(event) => setLlmModel(event.currentTarget.value)}
                  placeholder="gpt-4o"
                />
              </label>
              <label htmlFor="generate-llm-provider">
                <span>{t("generate.llm.provider")}</span>
                <input
                  id="generate-llm-provider"
                  aria-label={t("generate.llm.provider")}
                  autoComplete="off"
                  value={llmProvider}
                  onChange={(event) => setLlmProvider(event.currentTarget.value)}
                  placeholder="openai-compatible"
                />
              </label>
              <label htmlFor="generate-llm-api-key">
                <span>{t("generate.llm.apiKey")}</span>
                <input
                  id="generate-llm-api-key"
                  aria-label={t("generate.llm.apiKey")}
                  type="password"
                  autoComplete="off"
                  value={llmApiKey}
                  onChange={(event) => setLlmApiKey(event.currentTarget.value)}
                />
              </label>
            </div>
          )}
          <button
            type="button"
            className="s2s-btn s2s-btn-ghost generate-advanced-toggle"
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
        <p className="generate-message" style={{ color: "var(--warning)" }}>
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

function ProgressBadge({ stage }: { stage?: string }): JSX.Element | null {
  if (!stage) return null;
  if (stage === "done" || stage === "no-claims" || stage === "idle") return null;

  const isActive = ["analyst", "skeptic", "writer", "verifier"].includes(stage);
  const label = stage === "interrupted"
    ? "Interrupted"
    : stage === "error"
      ? "Errored"
      : `Running: ${stage}`;
  const className = stage === "interrupted"
    ? "progress-badge progress-badge-interrupted"
    : stage === "error"
      ? "progress-badge progress-badge-error"
      : "progress-badge progress-badge-running";

  return (
    <span
      className={className}
      role={isActive ? "status" : undefined}
      aria-label={`Run ${label}`}
      style={{ marginLeft: 8 }}
    >
      {label}
    </span>
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

function ScorePill({
  score,
  label,
}: {
  score: number;
  label?: string;
}): JSX.Element {
  return (
    <span
      className={`score-pill score-${scoreTone(score)}`}
      aria-label={label}
    >
      {score.toFixed(2)}
    </span>
  );
}

function IssuePill({
  count,
  label,
}: {
  count: number;
  label?: string;
}): JSX.Element {
  return (
    <span
      className={count > 0 ? "issue-pill has-issues" : "issue-pill"}
      aria-label={label}
    >
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

// Distinct group labels in first-seen order, for the group-filter select.
// Empty/whitespace groups are treated as ungrouped and excluded here.
function deriveGroups(runs: RunSummary[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const run of runs) {
    const group = run.group?.trim();
    if (!group) continue;
    if (seen.has(group)) continue;
    seen.add(group);
    ordered.push(group);
  }
  return ordered;
}

// Client-side row filter driven by the group-filter select. "" shows every
// run; UNGROUPED_FILTER narrows to runs with no group; any other value
// matches that exact group label.
function filterRunsByGroup(
  runs: RunSummary[],
  groupFilter: string,
): RunSummary[] {
  if (!groupFilter) return runs;
  if (groupFilter === UNGROUPED_FILTER) {
    return runs.filter((run) => !run.group);
  }
  return runs.filter((run) => run.group === groupFilter);
}

function scoreTone(score: number): "good" | "warning" | "danger" {
  if (score >= 0.8) return "good";
  if (score >= 0.6) return "warning";
  return "danger";
}

// Overall quality tone for the run rail: a verifier failure dominates,
// otherwise the skeptic score band decides. Drives the rail bar color so a
// column of runs reads green / amber / red at a glance.
function runQualityTone(run: RunSummary): "good" | "warning" | "danger" {
  if (!run.verifierPassed) return "danger";
  return scoreTone(run.skepticScore);
}

// Compact timestamp for the rail (the full locale string is too wide for a
// 360px column); the detail pane still uses the full formatGeneratedAt.
function formatGeneratedAtShort(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  onNewRun,
  newRunActive = false,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onShowDocs?: () => void;
  onNewRun?: () => void;
  newRunActive?: boolean;
}): JSX.Element {
  const { t } = useLocale();
  return (
    <div className="app-shell" style={style}>
      <div className="app-header">
        <div className="app-brand">
          <div className="app-kicker">{t("app.kicker")}</div>
          <h1>{t("app.title")}</h1>
          <p>{t("app.subtitle")}</p>
        </div>
        <div className="app-header-actions">
          {onNewRun && (
            <button
              type="button"
              onClick={onNewRun}
              className="s2s-btn s2s-btn-primary app-new-run"
              aria-pressed={newRunActive}
            >
              {t("app.newRun")}
            </button>
          )}
          {onShowDocs && (
            <button
              type="button"
              onClick={onShowDocs}
              className="s2s-btn docs-button"
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
