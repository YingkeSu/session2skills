import { type JSX, type CSSProperties } from "react";

import { useLocale } from "../i18n/LocaleContext.js";
import type { Translator } from "../i18n/translator.js";
import { type GenerationStage, type RunDetail } from "../runs.js";

type PipelineStage = Extract<
  GenerationStage,
  "analyst" | "skeptic" | "writer" | "verifier"
>;

const PIPELINE_ORDER: PipelineStage[] = [
  "analyst",
  "skeptic",
  "writer",
  "verifier",
];

const STAGE_COLORS: Record<PipelineStage, string> = {
  analyst: "var(--cat-blue)",
  skeptic: "var(--cat-rose)",
  writer: "var(--cat-violet)",
  verifier: "var(--cat-teal)",
};

export type StageStatus = "completed" | "failed" | "running" | "missing";

const GLYPH: Record<StageStatus, string> = {
  completed: "✓",
  failed: "✗",
  running: "⟳",
  missing: "⊘",
};

type TraceLike = Record<string, unknown>;

function isFailedFinishReason(reason: unknown): boolean {
  return (
    typeof reason === "string" &&
    (reason === "error" || reason === "failed" || reason === "length" || reason === "content-filter")
  );
}

function deriveStageStatus(
  stage: PipelineStage,
  detail: RunDetail | null,
): StageStatus {
  if (!detail) return "missing";

  const traces: TraceLike[] = Array.isArray(detail.traces)
    ? (detail.traces as TraceLike[])
    : [];
  const stageTraces = traces.filter(
    (t) => t.stage === stage && typeof t.stage === "string",
  );

  if (stageTraces.length === 0) return "missing";

  const anyFailed = stageTraces.some((t) => isFailedFinishReason(t.finishReason));
  if (anyFailed) return "failed";

  // Verifier has an authoritative verdict beyond trace presence.
  if (stage === "verifier" && detail.verifierReport) {
    return detail.verifierReport.pass ? "completed" : "failed";
  }

  return "completed";
}

function stageLabelKey(stage: PipelineStage): string {
  return `enum.stage.${stage}`;
}

type HarnessDagStripProps = {
  detail: RunDetail | null;
  onStageSelect?: (stage: PipelineStage) => void;
};

export function HarnessDagStrip({
  detail,
  onStageSelect,
}: HarnessDagStripProps): JSX.Element {
  const { t } = useLocale();

  return (
    <nav
      aria-label={t("dag.aria")}
      style={stripStyle}
    >
      <ol style={listStyle} role="list">
        {PIPELINE_ORDER.map((stage, index) => (
          <li key={stage} style={itemStyle}>
            <StageNode
              stage={stage}
              status={deriveStageStatus(stage, detail)}
              t={t}
              onSelect={onStageSelect}
            />
            {index < PIPELINE_ORDER.length - 1 && (
              <span aria-hidden="true" style={arrowStyle}>
                →
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

type StageNodeProps = {
  stage: PipelineStage;
  status: StageStatus;
  t: Translator["t"];
  onSelect?: (stage: PipelineStage) => void;
};

function StageNode({ stage, status, t, onSelect }: StageNodeProps): JSX.Element {
  const label = t(stageLabelKey(stage));
  const statusWord = t(`dag.status.${status}`);
  const color = STAGE_COLORS[stage];

  const handleClick = () => {
    onSelect?.(stage);
  };

  return (
    <button
      type="button"
      data-stage={stage}
      data-status={status}
      data-stage-color={color}
      data-testid={`dag-node-${stage}`}
      aria-label={`${label} · ${statusWord}`}
      onClick={handleClick}
      style={nodeButtonStyle(status, color)}
    >
      <span aria-hidden="true" style={glyphStyle(status)}>
        {GLYPH[status]}
      </span>
      <span style={nodeLabelStyle}>{label}</span>
    </button>
  );
}

const stripStyle: CSSProperties = {
  background: "var(--surface)",
  borderBottom: "1px solid var(--border-soft)",
  padding: "16px 20px",
  display: "flex",
  alignItems: "center",
};

const listStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flexWrap: "wrap",
};

const itemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const arrowStyle: CSSProperties = {
  color: "var(--ink-muted)",
  fontSize: "14px",
  fontWeight: 600,
  userSelect: "none",
};

function nodeButtonStyle(status: StageStatus, color: string): CSSProperties {
  const filled = status === "completed" || status === "running";
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 14px",
    borderRadius: "999px",
    border: `1.5px solid ${filled ? color : "var(--border-strong)"}`,
    background: filled ? color : "var(--surface)",
    color: filled ? "var(--ink-on-fill)" : "var(--ink-2)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: status === "running" ? "var(--shadow-1)" : "none",
  };
}

function glyphStyle(status: StageStatus): CSSProperties {
  const color =
    status === "completed"
      ? "var(--ink-on-fill)"
      : status === "failed"
        ? "var(--danger-ink)"
        : status === "running"
          ? "var(--warning-ink)"
          : "var(--ink-muted)";
  return {
    fontSize: "14px",
    fontWeight: 700,
    lineHeight: 1,
    width: "16px",
    textAlign: "center",
    color,
  };
}

const nodeLabelStyle: CSSProperties = {
  lineHeight: 1,
};
