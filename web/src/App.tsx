import { useEffect, useState } from "react";

import { fetchRuns, type RunSummary } from "./runs.js";
import { RunDetailPage } from "./components/RunDetailPage.js";
import { LanguageToggle } from "./i18n/LanguageToggle.js";
import { useLocale } from "./i18n/LocaleContext.js";

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
      <RunTable
        runs={state.runs}
        onSelect={(name) => setSelectedRun(name)}
      />
    </Shell>
  );
}

function RunTable({
  runs,
  onSelect,
}: {
  runs: RunSummary[];
  onSelect: (name: string) => void;
}): JSX.Element {
  const { t } = useLocale();
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>{t("runTable.name")}</th>
          <th style={thStyle}>{t("runTable.model")}</th>
          <th style={thStyle}>{t("runTable.generatedAt")}</th>
          <th style={thStyle}>{t("runTable.verifier")}</th>
          <th style={thStyle}>{t("runTable.claims")}</th>
          <th style={thStyle}>{t("runTable.skepticScore")}</th>
          <th style={thStyle}>{t("runTable.issues")}</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <tr
            key={run.name}
            onClick={() => onSelect(run.name)}
            style={{ cursor: "pointer" }}
          >
            <td style={tdStyle}>{run.name}</td>
            <td style={tdStyle}>{run.model}</td>
            <td style={tdStyle}>{run.generatedAt}</td>
            <td style={tdStyle}>
              <Badge pass={run.verifierPassed} />
            </td>
            <td style={tdStyle}>{run.claimCount}</td>
            <td style={tdStyle}>{run.skepticScore.toFixed(2)}</td>
            <td style={tdStyle}>{run.skepticIssueCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Badge({ pass }: { pass: boolean }): JSX.Element {
  const { t } = useLocale();
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "12px",
        fontWeight: 600,
        color: pass ? "#fff" : "#721c24",
        background: pass ? "#27ae60" : "#f8d7da",
      }}
    >
      {pass ? t("badge.pass") : t("badge.fail")}
    </span>
  );
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
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "24px", ...style }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <h1 style={{ fontSize: "20px", margin: 0 }}>{t("app.title")}</h1>
        <LanguageToggle />
      </div>
      {children}
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
  fontSize: "14px",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "2px solid #ddd",
  padding: "8px 12px",
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: "8px 12px",
};
