import { useEffect, useState } from "react";
import { fetchRunDetail, type RunDetail } from "../runs.js";
import { AuditViewTab } from "./AuditViewTab.js";
import { ReportsTab } from "./ReportsTab.js";
import { PreviewTracesTab } from "./PreviewTracesTab.js";
import { LanguageToggle } from "../i18n/LanguageToggle.js";
import { useLocale } from "../i18n/LocaleContext.js";

type Tab = "audit" | "reports" | "preview";

type RunDetailPageProps = {
  runName: string;
  onBack: () => void;
};

export function RunDetailPage({
  runName,
  onBack,
}: RunDetailPageProps): JSX.Element {
  const { t } = useLocale();
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [status, setStatus] = useState<
    "loading" | "error" | "ready"
  >("loading");
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

  const tabs: { id: Tab; label: string }[] = [
    { id: "audit", label: t("tab.audit") },
    { id: "reports", label: t("tab.reports") },
    { id: "preview", label: t("tab.preview") },
  ];

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "24px",
      }}
    >
      <button
        type="button"
        onClick={onBack}
        style={{
          padding: "6px 12px",
          borderRadius: "4px",
          border: "1px solid #ced4da",
          background: "#fff",
          cursor: "pointer",
          fontSize: "13px",
          marginBottom: "16px",
        }}
      >
        {t("detail.back")}
      </button>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "4px",
        }}
      >
        <h1 style={{ fontSize: "22px", margin: 0 }}>{runName}</h1>
        <LanguageToggle />
      </div>

      <nav
        style={{
          display: "flex",
          gap: "4px",
          margin: "16px 0",
          borderBottom: "1px solid #dee2e6",
        }}
      >
        {tabs.map((tabItem) => {
          const active = tab === tabItem.id;
          return (
            <button
              key={tabItem.id}
              type="button"
              onClick={() => setTab(tabItem.id)}
              style={{
                padding: "8px 14px",
                border: "none",
                borderBottom: active
                  ? "2px solid #0d6efd"
                  : "2px solid transparent",
                background: "transparent",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: active ? 600 : 400,
                color: active ? "#0d6efd" : "#495057",
                marginBottom: "-1px",
              }}
            >
              {tabItem.label}
            </button>
          );
        })}
      </nav>

      {status === "loading" && (
        <div
          style={{
            padding: "32px",
            textAlign: "center",
            color: "#666",
          }}
        >
          {t("detail.loading")}
        </div>
      )}

      {status === "error" && (
        <div style={{ color: "#c0392b", padding: "16px" }}>
          {t("detail.errorPrefix", { message: error })}
        </div>
      )}

      {status === "ready" && detail && (
        <>
          {tab === "audit" && (
            <AuditViewTab
              manifest={detail.claimManifest ?? {
                schemaVersion: "claim-manifest/v1",
                claims: [],
                evidenceSummary: "",
                dimensionsCovered: [],
                metadata: {
                  generatedAt: "",
                  sessionCount: 0,
                  totalEvidenceItems: 0,
                },
              }}
              skepticReport={detail.skepticReport}
              verifierReport={detail.verifierReport}
              runName={runName}
            />
          )}
          {tab === "reports" && (
            <ReportsTab
              skepticReport={detail.skepticReport}
              verifierReport={detail.verifierReport}
            />
          )}
          {tab === "preview" && (
            <PreviewTracesTab
              skillMarkdown={detail.skillMarkdown}
              traces={detail.traces}
            />
          )}
        </>
      )}
    </div>
  );
}
