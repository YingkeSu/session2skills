import { useState } from "react";
import type { EvidenceDetail } from "../runs.js";
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
  const [fullText, setFullText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayText = fullText ?? excerpt;
  const badgeColor = sourceTypeColors[sourceType] ?? "#6c757d";

  const handleToggle = async () => {
    if (!expanded && fullText === null) {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/runs/${encodeURIComponent(runName)}/evidence/${encodeURIComponent(evidenceId)}`
        );
        if (!res.ok) {
          throw new Error(t("evidence.loadFailed", { status: res.status }));
        }
        const data = (await res.json()) as EvidenceDetail;
        setFullText(data.excerpt);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("evidence.loadFailedGeneric"),
        );
      } finally {
        setLoading(false);
      }
    }
    setExpanded(!expanded);
  };

  return (
    <div
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
        disabled={loading}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "8px 10px",
          border: "none",
          background: "transparent",
          cursor: loading ? "wait" : "pointer",
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
            : loading
              ? t("evidence.loading")
              : t("evidence.show")}
        </span>
      </button>

      <div
        style={{
          maxHeight: expanded ? "600px" : "0px",
          opacity: expanded ? 1 : 0,
          transition: "max-height 200ms ease-in-out, opacity 150ms ease-in-out",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "0 10px 10px" }}>
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
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
