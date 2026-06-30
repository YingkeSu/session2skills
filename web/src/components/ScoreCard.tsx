import { type ReactNode } from "react";
import type { SkillEvaluation } from "../runs.js";

export type ScoreCardProps = {
  evaluation: SkillEvaluation | null;
};

const DIMENSIONS = [
  { key: "grounding", label: "Grounding" },
  { key: "actionability", label: "Actionability" },
  { key: "specificity", label: "Specificity" },
  { key: "safety", label: "Safety" },
  { key: "concision", label: "Concision" },
  { key: "discoverability", label: "Discoverability" },
  { key: "skepticQuality", label: "Skeptic Quality" },
  { key: "evidenceRichness", label: "Evidence Richness" },
] as const;

const GRADE_BADGE: Record<string, string> = {
  A: "s2s-badge s2s-badge-block s2s-badge-success",
  B: "s2s-badge s2s-badge-block s2s-badge-accent",
  C: "s2s-badge s2s-badge-block s2s-badge-warning",
  D: "s2s-badge s2s-badge-block s2s-badge-amber",
  F: "s2s-badge s2s-badge-block s2s-badge-danger",
};

const GRADE_INK: Record<string, string> = {
  A: "var(--success)",
  B: "var(--accent)",
  C: "var(--warning)",
  D: "var(--cat-amber)",
  F: "var(--danger)",
};

const VERDICT_BADGE: Record<string, string> = {
  pass: "s2s-badge s2s-badge-success",
  "needs-patch": "s2s-badge s2s-badge-warning",
  reject: "s2s-badge s2s-badge-danger",
};

function formatScore(value: number): string {
  return value.toFixed(2);
}

function gradeBadgeClassName(grade: string): string {
  return GRADE_BADGE[grade] ?? "s2s-badge s2s-badge-block s2s-badge-muted";
}

const gradeBadgeStyle: React.CSSProperties = {
  width: "56px",
  height: "56px",
  fontSize: "28px",
  flexShrink: 0,
};

function scoreValueStyle(grade: string): React.CSSProperties {
  return {
    fontSize: "36px",
    fontWeight: "var(--font-weight-max)",
    lineHeight: 1.1,
    fontVariantNumeric: "tabular-nums",
    color: GRADE_INK[grade] ?? "var(--ink)",
  };
}

const dimensionBarStyle = (widthPercent: number): React.CSSProperties => ({
  height: "var(--space-2)",
  borderRadius: "var(--radius-sm)",
  background: "var(--accent)",
  flex: "1 1 auto",
  width: `${widthPercent}%`,
  maxWidth: "100%",
});

const dimensionLabelStyle: React.CSSProperties = {
  fontSize: "var(--text-sm)",
  fontWeight: 500,
  color: "var(--ink-2)",
  minWidth: "110px",
  flexShrink: 0,
};

const dimensionValueStyle: React.CSSProperties = {
  fontSize: "var(--text-sm)",
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
  color: "var(--ink)",
  minWidth: "36px",
  textAlign: "right",
  flexShrink: 0,
};

function verdictBadgeClassName(verdict: string): string {
  return VERDICT_BADGE[verdict] ?? "s2s-badge s2s-badge-muted";
}

const verdictPillStyle: React.CSSProperties = {
  fontSize: "var(--text-sm)",
  fontWeight: "var(--font-weight-strong)",
};

const safetyGateStyle: React.CSSProperties = {
  marginTop: "var(--space-2)",
  padding: "var(--space-2) var(--space-3)",
  borderRadius: "var(--radius-sm)",
  background: "var(--danger-soft)",
  border: "1px solid var(--danger)",
  color: "var(--danger-ink)",
  fontSize: "var(--text-sm)",
  fontWeight: 600,
};

export function ScoreCard({ evaluation }: ScoreCardProps): ReactNode {
  if (!evaluation) {
    return (
      <div className="s2s-card score-card-placeholder">
        <span className="score-card-placeholder-text">Not evaluated yet</span>
      </div>
    );
  }

  const grade = evaluation.grade ?? "F";
  const composite = evaluation.composite ?? 0;
  const verdict = evaluation.verdict;
  const showSafetyGate = grade === "F" && verdict === "reject";

  return (
    <div className="s2s-card score-card">
      <div className="score-card-header">
        <div className="score-card-cluster">
          <span data-testid="composite-score" style={scoreValueStyle(grade)}>
            {formatScore(composite)}
          </span>
          <span
            data-testid="grade-badge"
            className={gradeBadgeClassName(grade)}
            style={gradeBadgeStyle}
            aria-label={`Grade ${grade}`}
          >
            {grade}
          </span>
        </div>
        <div className="score-card-meta">
          <span
            data-testid="verdict-pill"
            className={verdictBadgeClassName(verdict)}
            style={verdictPillStyle}
          >
            {verdict}
          </span>
          <div
            data-testid="safety-gate"
            className="score-card-safety-gate"
            style={{ ...safetyGateStyle, display: showSafetyGate ? "block" : "none" }}
          >
            Safety gate failed
          </div>
        </div>
      </div>
      <div className="score-card-dimensions">
        {DIMENSIONS.map(({ key, label }) => {
          const raw = evaluation.scores[key];
          const value = typeof raw === "number" ? raw : 0;
          const widthPercent = Math.round(value * 100);
          return (
            <div key={key} className="score-card-dimension">
              <span style={dimensionLabelStyle}>{label}</span>
              <div
                data-testid={`dim-bar-${key}`}
                style={dimensionBarStyle(widthPercent)}
              />
              <span style={dimensionValueStyle}>{formatScore(value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
