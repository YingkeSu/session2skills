import { useState, type JSX } from "react";
import { useEvidenceDetailQuery } from "../hooks/useQueries.js";
import { useLocale } from "../i18n/LocaleContext.js";

type EvidencePanelProps = {
  evidenceId: string;
  excerpt: string;
  sourceType: string;
  runName: string;
};

// Source type → categorical badge fill. The badge leads the row so the read
// is "a message/tool/step excerpt", not a raw identifier dump.
const sourceTypeBadge: Record<string, string> = {
  message: "s2s-badge-blue",
  tool: "s2s-badge-teal",
  step: "s2s-badge-violet",
};

// Cap the collapsed preview so a long excerpt never overwhelms the workspace.
const PREVIEW_MAX = 160;

function buildPreview(excerpt: string): string {
  const firstLine =
    excerpt.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  const trimmed = firstLine.trim();
  if (trimmed.length <= PREVIEW_MAX) return trimmed;
  return `${trimmed.slice(0, PREVIEW_MAX).trimEnd()}…`;
}

export function EvidencePanel({
  evidenceId,
  excerpt,
  sourceType,
  runName,
}: EvidencePanelProps): JSX.Element {
  const { t, tEnum } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Full evidence is fetched lazily — only once the inspector is opened.
  const { data, isLoading, error } = useEvidenceDetailQuery(
    runName,
    expanded ? evidenceId : null,
  );

  const displayText = data?.excerpt ?? excerpt;
  const badgeClass = sourceTypeBadge[sourceType] ?? "s2s-badge-muted";
  const panelId = `evidence-${runName}-${evidenceId}`.replace(/\s+/g, "-");
  const preview = buildPreview(excerpt);

  const handleToggle = () => {
    if (isLoading) return;
    setExpanded((prev) => !prev);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(displayText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="s2s-inspector" data-testid="evidence-panel">
      <button
        type="button"
        className="s2s-inspector-toggle"
        onClick={handleToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-busy={isLoading}
        disabled={isLoading}
      >
        <span className="s2s-inspector-row">
          <span className="s2s-tag-row">
            <span className={`s2s-badge s2s-badge-sm ${badgeClass}`}>
              {tEnum("sourceType", sourceType)}
            </span>
            <span className="s2s-code-id">{evidenceId}</span>
          </span>
          <span className="s2s-inspector-affordance">
            {expanded
              ? t("evidence.hide")
              : isLoading
                ? t("evidence.loading")
                : t("evidence.show")}
          </span>
        </span>
        {/* The preview uses the inline excerpt we already have, so scanning
            a list of evidence does not require expanding (or fetching) each. */}
        {preview.length > 0 && !expanded && (
          <span className="s2s-inspector-preview">{preview}</span>
        )}
      </button>

      <div
        id={panelId}
        className="s2s-inspector-body"
        data-open={expanded ? "true" : "false"}
      >
        <div>
          <div className="s2s-inspector-content">
            {isLoading && (
              <p className="s2s-inspector-note">{t("evidence.loading")}</p>
            )}
            <pre className="s2s-excerpt">{displayText}</pre>
            <div className="s2s-inspector-actions">
              <button
                type="button"
                className="s2s-btn s2s-btn-ghost"
                onClick={handleCopy}
              >
                {copied ? t("evidence.copied") : t("evidence.copy")}
              </button>
            </div>
            {error && (
              <p className="s2s-inspector-error">
                {error instanceof Error ? error.message : String(error)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
