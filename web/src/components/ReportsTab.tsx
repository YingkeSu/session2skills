import type { SkepticReport, VerifierReport } from "../runs.js";
import { useLocale } from "../i18n/LocaleContext.js";

type ReportsTabProps = {
  skepticReport: SkepticReport | null;
  verifierReport: VerifierReport | null;
};

import type { JSX } from "react";

function scoreBadge(score: number): JSX.Element {
  const color =
    score >= 0.8 ? "var(--success)" : score >= 0.5 ? "var(--warning)" : "var(--danger)";
  return (
    <span
      style={{
        padding: "var(--space-1) var(--space-3)",
        borderRadius: "var(--radius-pill)",
        fontSize: "var(--text-sm)",
        fontWeight: 600,
        color: "var(--ink-on-fill)",
        background: color,
      }}
    >
      {(score * 100).toFixed(0)}%
    </span>
  );
}

function severityColor(severity: "high" | "medium" | "low"): string {
  if (severity === "high") return "var(--danger)";
  if (severity === "medium") return "var(--warning)";
  return "var(--accent)";
}

export function ReportsTab({
  skepticReport,
  verifierReport,
}: ReportsTabProps): JSX.Element {
  const { t, tEnum } = useLocale();
  const hasSkeptic = skepticReport !== null;
  const hasVerifier = verifierReport !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <section style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <h3 style={sectionTitleStyle}>{t("reports.skepticTitle")}</h3>
          {hasSkeptic && scoreBadge(skepticReport.overallScore)}
        </div>

        {!hasSkeptic ? (
          <p style={{ color: "var(--ink-muted)" }}>{t("reports.noSkeptic")}</p>
        ) : (
          <>
            <div style={summaryStyle}>
              {t("reports.skepticSummary", {
                count: skepticReport.metadata.issueCount,
                claims: skepticReport.metadata.claimCount,
              })}
            </div>
            {skepticReport.issues.length === 0 ? (
              <p style={{ color: "var(--success-ink)" }}>{t("reports.noIssues")}</p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                {skepticReport.issues.map((issue, idx) => (
                  <details
                    key={`${issue.claimId}-${issue.problemType}-${idx}`}
                    style={issueCardStyle}
                  >
                    <summary
                      style={{
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        listStyle: "none",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            background: severityColor(issue.severity),
                            color: "var(--ink-on-fill)",
                          }}
                        >
                          {tEnum("severity", issue.severity)}
                        </span>
                        <strong style={{ fontSize: "13px" }}>
                          {issue.problemType}
                        </strong>
                        <span style={metaChipStyle}>
                          {t("reports.claimLabel", { id: issue.claimId })}
                        </span>
                      </span>
                    </summary>
                    <div
                      style={{
                        marginTop: "8px",
                        fontSize: "13px",
                        lineHeight: 1.5,
                        color: "var(--ink)",
                      }}
                    >
                      <p style={{ margin: "0 0 6px" }}>{issue.detail}</p>
                      <p style={{ margin: 0, color: "var(--ink-2)" }}>
                        <strong>{t("reports.suggestion")}</strong> {issue.suggestion}
                      </p>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <h3 style={sectionTitleStyle}>{t("reports.verifierTitle")}</h3>
          {hasVerifier && (
            <span
              style={{
                padding: "4px 10px",
                borderRadius: "999px",
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--ink-on-fill)",
                background: verifierReport.pass ? "var(--success)" : "var(--danger)",
              }}
            >
              {verifierReport.pass ? t("badge.pass") : t("badge.fail")}
            </span>
          )}
        </div>

        {!hasVerifier ? (
          <p style={{ color: "var(--ink-muted)" }}>{t("reports.noVerifier")}</p>
        ) : (
          <>
            <div style={summaryStyle}>
              {t("reports.verifierSummary", {
                directives: verifierReport.metadata.directiveCount,
                verified: verifierReport.metadata.verifiedCount,
                fabricated: verifierReport.metadata.fabricatedCount,
              })}
            </div>

            {verifierReport.issues.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  marginBottom: "12px",
                }}
              >
                {verifierReport.issues.map((issue, idx) => (
                  <details
                    key={`verifier-issue-${idx}`}
                    style={issueCardStyle}
                  >
                    <summary
                      style={{
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        listStyle: "none",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            background: severityColor(issue.severity),
                            color: "var(--ink-on-fill)",
                          }}
                        >
                          {tEnum("severity", issue.severity)}
                        </span>
                        <strong style={{ fontSize: "13px" }}>
                          {issue.location}
                        </strong>
                      </span>
                    </summary>
                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: "13px",
                        lineHeight: 1.5,
                        color: "var(--ink)",
                      }}
                    >
                      {issue.description}
                    </p>
                  </details>
                ))}
              </div>
            )}

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  borderCollapse: "collapse",
                  width: "100%",
                  fontSize: "13px",
                }}
              >
                <thead>
                  <tr>
                    <th style={thStyle}>{t("reports.directive")}</th>
                    <th style={thStyle}>{t("reports.claim")}</th>
                    <th style={thStyle}>{t("reports.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {verifierReport.checkedItems.map((item, idx) => (
                    <tr key={`checked-${idx}`}>
                      <td style={tdStyle}>{item.directive}</td>
                      <td style={tdStyle}>
                        {item.claimId ?? "—"}
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            color: "var(--ink-on-fill)",
                            background:
                              trustColors[item.status] ?? "var(--cat-gray)",
                          }}
                        >
                          {tEnum("status", item.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "var(--space-4)",
  background: "var(--surface)",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-3)",
  marginBottom: "var(--space-3)",
  flexWrap: "wrap",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--text-md)",
  fontWeight: 700,
  color: "var(--ink)",
};

const summaryStyle: React.CSSProperties = {
  fontSize: "var(--text-sm)",
  color: "var(--ink-2)",
  marginBottom: "var(--space-3)",
  lineHeight: 1.5,
};

const issueCardStyle: React.CSSProperties = {
  border: "1px solid var(--border-soft)",
  borderRadius: "var(--radius-sm)",
  padding: "var(--space-3)",
  background: "var(--surface)",
};

const metaChipStyle: React.CSSProperties = {
  padding: "2px var(--space-2)",
  borderRadius: "var(--radius-pill)",
  background: "var(--surface-3)",
  color: "var(--ink-2)",
  fontSize: "var(--text-xs)",
  whiteSpace: "nowrap",
};

const trustColors: Record<string, string> = {
  verified: "var(--success)",
  unreferenced: "var(--warning)",
  fabricated: "var(--danger)",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "2px solid var(--border)",
  padding: "var(--space-2) var(--space-3)",
  fontSize: "var(--text-xs)",
  color: "var(--ink-muted)",
  background: "var(--surface-2)",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid var(--border-soft)",
  padding: "var(--space-2) var(--space-3)",
  verticalAlign: "top",
  fontSize: "var(--text-sm)",
  color: "var(--ink-2)",
};
