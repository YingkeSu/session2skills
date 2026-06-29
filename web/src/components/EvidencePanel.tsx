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
  message: "var(--cat-blue)",
  tool: "var(--cat-teal)",
  step: "var(--cat-violet)",
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
  const badgeColor = sourceTypeColors[sourceType] ?? "var(--cat-gray)";
  const panelId = `evidence-${runName}-${evidenceId}`.replace(/\s+/g, "-");

  const handleToggle = () => {
    if (isLoading) return;
    setExpanded((prev) => !prev);
  };

  return (
    <div
      data-testid="evidence-panel"
      style={{
        marginTop: "var(--space-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface)",
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
          padding: "var(--space-2) var(--space-3)",
          border: "none",
          background: "transparent",
          cursor: isLoading ? "wait" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minWidth: 0 }}>
          <strong style={{ fontSize: "var(--text-xs)", color: "var(--ink)", overflowWrap: "anywhere", minWidth: 0 }}>{evidenceId}</strong>
          <span
            style={{
              padding: "2px var(--space-2)",
              borderRadius: "var(--radius-sm)",
              background: badgeColor,
              color: "var(--ink-on-fill)",
              fontSize: "11px",
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {tEnum("sourceType", sourceType)}
          </span>
        </div>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--ink-2)", flexShrink: 0 }}>
          {expanded
            ? t("evidence.hide")
            : isLoading
              ? t("evidence.loading")
              : t("evidence.show")}
        </span>
      </button>

      {/* grid-template-rows animates height without layout-thrashing max-height,
          and has no hard ceiling so long excerpts are never clipped. */}
      <div
        id={panelId}
        style={{
          display: "grid",
          gridTemplateRows: expanded ? "1fr" : "0fr",
          opacity: expanded ? 1 : 0,
          transition: "grid-template-rows 200ms ease-in-out, opacity 150ms ease-in-out",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div style={{ padding: "0 var(--space-3) var(--space-3)" }}>
            {isLoading && (
              <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-xs)", color: "var(--ink-2)" }}>
                {t("evidence.loading")}
              </p>
            )}
            <pre
              style={{
                margin: 0,
                padding: "var(--space-3)",
                background: "var(--surface-2)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-soft)",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-sm)",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: "var(--ink)",
              }}
            >
              {displayText}
            </pre>
            {error && (
              <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-xs)", color: "var(--danger)" }}>
                {error instanceof Error ? error.message : String(error)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
