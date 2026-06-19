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
  A: "#28a745",
  B: "#0969da",
  C: "#d4a017",
  D: "#db6d28",
  F: "#cf222e",
};

const VERDICT_COLORS: Record<string, string> = {
  pass: "#28a745",
  "needs-patch": "#d4a017",
  reject: "#cf222e",
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
    borderRadius: "8px",
    background: GRADE_COLORS[grade] ?? "#6c757d",
    color: "#fff",
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
    color: GRADE_COLORS[grade] ?? "#212529",
  };
}

function dimensionBarStyle(widthPercent: number): React.CSSProperties {
  return {
    height: "8px",
    borderRadius: "4px",
    background: "#0d6efd",
    flex: "1 1 auto",
    width: `${widthPercent}%`,
    maxWidth: "100%",
  };
}

function dimensionLabelStyle(): React.CSSProperties {
  return {
    fontSize: "13px",
    fontWeight: 500,
    color: "#495057",
    minWidth: "110px",
    flexShrink: 0,
  };
}

function dimensionValueStyle(): React.CSSProperties {
  return {
    fontSize: "13px",
    fontWeight: 600,
    color: "#212529",
    minWidth: "36px",
    textAlign: "right",
    flexShrink: 0,
  };
}

function verdictPillStyle(verdict: string): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "4px 12px",
    borderRadius: "999px",
    fontSize: "13px",
    fontWeight: 600,
    color: "#fff",
    background: VERDICT_COLORS[verdict] ?? "#6c757d",
  };
}

function safetyGateStyle(): React.CSSProperties {
  return {
    marginTop: "8px",
    padding: "8px 12px",
    borderRadius: "4px",
    background: "#fff5f5",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#cf222e",
    color: "#cf222e",
    fontSize: "13px",
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
  border: "1px dashed #ced4da",
  borderRadius: "6px",
  padding: "24px",
  textAlign: "center",
  background: "#f8f9fa",
};

const placeholderTextStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#6c757d",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #dee2e6",
  borderRadius: "6px",
  padding: "16px",
  background: "#fff",
  display: "flex",
  flexDirection: "column",
  gap: "14px",
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
