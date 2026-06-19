import { useState, type JSX } from "react";
import { useEvidenceDetailQuery } from "../hooks/useQueries.js";
import { useLocale } from "../i18n/LocaleContext.js";

type EvidencePanelProps = {
  evidenceId: string;
  excerpt: string;
  sourceType: string;
  runName: string;
};

const sourceTypeColors: Record<string, string> = {
  message: "#0d6efd",
  tool: "#198754",
  step: "#6f42c1",
};

export function EvidencePanel({
  evidenceId,
  excerpt,
  sourceType,
  runName,
}: EvidencePanelProps): JSX.Element {
  const { t, tEnum } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, error } = useEvidenceDetailQuery(
    runName,
    expanded ? evidenceId : null,
  );

  const displayText = data?.excerpt ?? excerpt;
  const badgeColor = sourceTypeColors[sourceType] ?? "#6c757d";
  const panelId = `evidence-${runName}-${evidenceId}`.replace(/\s+/g, "-");

  const handleToggle = () => {
    if (isLoading) return;
    setExpanded((prev) => !prev);
  };

  return (
    <div
      data-testid="evidence-panel"
      style={{
        marginTop: "6px",
        border: "1px solid #dee2e6",
        borderRadius: "4px",
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-busy={isLoading}
        disabled={isLoading}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "8px 10px",
          border: "none",
          background: "transparent",
          cursor: isLoading ? "wait" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <strong style={{ fontSize: "12px" }}>{evidenceId}</strong>
          <span
            style={{
              padding: "2px 6px",
              borderRadius: "4px",
              background: badgeColor,
              color: "#fff",
              fontSize: "11px",
            }}
          >
            {tEnum("sourceType", sourceType)}
          </span>
        </div>
        <span style={{ fontSize: "12px", color: "#495057" }}>
          {expanded
            ? t("evidence.hide")
            : isLoading
              ? t("evidence.loading")
              : t("evidence.show")}
        </span>
      </button>

      <div
        id={panelId}
        style={{
          maxHeight: expanded ? "600px" : "0px",
          opacity: expanded ? 1 : 0,
          transition: "max-height 200ms ease-in-out, opacity 150ms ease-in-out",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "0 10px 10px" }}>
          {isLoading && (
            <p style={{ margin: "0 0 8px", fontSize: "12px", color: "#495057" }}>
              {t("evidence.loading")}
            </p>
          )}
          <pre
            style={{
              margin: 0,
              padding: "10px",
              background: "#f8f9fa",
              borderRadius: "4px",
              fontSize: "13px",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {displayText}
          </pre>
          {error && (
            <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#c0392b" }}>
              {error instanceof Error ? error.message : String(error)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
