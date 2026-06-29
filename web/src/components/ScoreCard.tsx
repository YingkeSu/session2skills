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

const GRADE_COLORS: Record<string, string> = {
  A: "var(--success)",
  B: "var(--accent)",
  C: "var(--warning)",
  D: "var(--cat-amber)",
  F: "var(--danger)",
};

const VERDICT_COLORS: Record<string, string> = {
  pass: "var(--success)",
  "needs-patch": "var(--warning)",
  reject: "var(--danger)",
};

function formatScore(value: number): string {
  return value.toFixed(2);
}

function gradeBadgeStyle(grade: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "56px",
    height: "56px",
    borderRadius: "var(--radius)",
    background: GRADE_COLORS[grade] ?? "var(--cat-gray)",
    color: "var(--ink-on-fill)",
    fontSize: "28px",
    fontWeight: 700,
    lineHeight: 1,
    flexShrink: 0,
  };
}

function scoreValueStyle(grade: string): React.CSSProperties {
  return {
    fontSize: "36px",
    fontWeight: 700,
    lineHeight: 1.1,
    fontVariantNumeric: "tabular-nums",
    color: GRADE_COLORS[grade] ?? "var(--ink)",
  };
}

function dimensionBarStyle(widthPercent: number): React.CSSProperties {
  return {
    height: "8px",
    borderRadius: "var(--radius-sm)",
    background: "var(--accent)",
    flex: "1 1 auto",
    width: `${widthPercent}%`,
    maxWidth: "100%",
  };
}

function dimensionLabelStyle(): React.CSSProperties {
  return {
    fontSize: "var(--text-sm)",
    fontWeight: 500,
    color: "var(--ink-2)",
    minWidth: "110px",
    flexShrink: 0,
  };
}

function dimensionValueStyle(): React.CSSProperties {
  return {
    fontSize: "var(--text-sm)",
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    color: "var(--ink)",
    minWidth: "36px",
    textAlign: "right",
    flexShrink: 0,
  };
}

function verdictPillStyle(verdict: string): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "var(--space-1) var(--space-3)",
    borderRadius: "var(--radius-pill)",
    fontSize: "var(--text-sm)",
    fontWeight: 600,
    color: "var(--ink-on-fill)",
    background: VERDICT_COLORS[verdict] ?? "var(--cat-gray)",
  };
}

function safetyGateStyle(): React.CSSProperties {
  return {
    marginTop: "var(--space-2)",
    padding: "var(--space-2) var(--space-3)",
    borderRadius: "var(--radius-sm)",
    background: "var(--danger-soft)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--danger)",
    color: "var(--danger-ink)",
    fontSize: "var(--text-sm)",
    fontWeight: 600,
  };
}

export function ScoreCard({ evaluation }: ScoreCardProps): ReactNode {
  if (!evaluation) {
    return (
      <div style={placeholderStyle}>
        <span style={placeholderTextStyle}>Not evaluated yet</span>
      </div>
    );
  }

  const grade = evaluation.grade ?? "F";
  const composite = evaluation.composite ?? 0;
  const verdict = evaluation.verdict;
  const showSafetyGate = grade === "F" && verdict === "reject";

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <div style={scoreClusterStyle}>
          <span data-testid="composite-score" style={scoreValueStyle(grade)}>
            {formatScore(composite)}
          </span>
          <span
            data-testid="grade-badge"
            style={gradeBadgeStyle(grade)}
            aria-label={`Grade ${grade}`}
          >
            {grade}
          </span>
        </div>
        <div style={metaClusterStyle}>
          <span
            data-testid="verdict-pill"
            style={verdictPillStyle(verdict)}
          >
            {verdict}
          </span>
          <div
            data-testid="safety-gate"
            style={{
              ...safetyGateStyle(),
              display: showSafetyGate ? "block" : "none",
            }}
          >
            Safety gate failed
          </div>
        </div>
      </div>
      <div style={dimensionsStyle}>
        {DIMENSIONS.map(({ key, label }) => {
          const raw = evaluation.scores[key];
          const value = typeof raw === "number" ? raw : 0;
          const widthPercent = Math.round(value * 100);
          return (
            <div key={key} style={dimensionRowStyle}>
              <span style={dimensionLabelStyle()}>{label}</span>
              <div
                data-testid={`dim-bar-${key}`}
                style={dimensionBarStyle(widthPercent)}
              />
              <span style={dimensionValueStyle()}>{formatScore(value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const placeholderStyle: React.CSSProperties = {
  border: "1px dashed var(--border-strong)",
  borderRadius: "var(--radius)",
  padding: "var(--space-6)",
  textAlign: "center",
  background: "var(--surface-2)",
};

const placeholderTextStyle: React.CSSProperties = {
  fontSize: "var(--text-base)",
  color: "var(--ink-muted)",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  padding: "var(--space-4)",
  background: "var(--surface)",
  boxShadow: "var(--shadow-1)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-4)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "16px",
  flexWrap: "wrap",
};

const scoreClusterStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
};

const metaClusterStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: "6px",
};

const dimensionsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const dimensionRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
};
