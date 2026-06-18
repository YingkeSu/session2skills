import type { SkepticReport, VerifierReport } from "../runs.js";
import { useLocale } from "../i18n/LocaleContext.js";

type ReportsTabProps = {
  skepticReport: SkepticReport | null;
  verifierReport: VerifierReport | null;
};

import type { JSX } from "react";

function scoreBadge(score: number): JSX.Element {
  const color =
    score >= 0.8 ? "#27ae60" : score >= 0.5 ? "#f39c12" : "#c0392b";
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: "999px",
        fontSize: "13px",
        fontWeight: 600,
        color: "#fff",
        background: color,
      }}
    >
      {(score * 100).toFixed(0)}%
    </span>
  );
}

function severityColor(severity: "high" | "medium" | "low"): string {
  if (severity === "high") return "#c0392b";
  if (severity === "medium") return "#f39c12";
  return "#0d6efd";
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
          <p style={{ color: "#666" }}>{t("reports.noSkeptic")}</p>
        ) : (
          <>
            <div style={summaryStyle}>
              {t("reports.skepticSummary", {
                count: skepticReport.metadata.issueCount,
                claims: skepticReport.metadata.claimCount,
              })}
            </div>
            {skepticReport.issues.length === 0 ? (
              <p style={{ color: "#28a745" }}>{t("reports.noIssues")}</p>
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
                            color: "#fff",
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
                        color: "#212529",
                      }}
                    >
                      <p style={{ margin: "0 0 6px" }}>{issue.detail}</p>
                      <p style={{ margin: 0, color: "#495057" }}>
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
                color: "#fff",
                background: verifierReport.pass ? "#27ae60" : "#c0392b",
              }}
            >
              {verifierReport.pass ? t("badge.pass") : t("badge.fail")}
            </span>
          )}
        </div>

        {!hasVerifier ? (
          <p style={{ color: "#666" }}>{t("reports.noVerifier")}</p>
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
                            color: "#fff",
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
                        color: "#212529",
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
                            color: "#fff",
                            background:
                              trustColors[item.status] ?? "#6c757d",
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
  border: "1px solid #dee2e6",
  borderRadius: "6px",
  padding: "14px",
  background: "#fff",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  marginBottom: "10px",
  flexWrap: "wrap",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "15px",
  fontWeight: 700,
};

const summaryStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#495057",
  marginBottom: "10px",
  lineHeight: 1.5,
};

const issueCardStyle: React.CSSProperties = {
  border: "1px solid #e9ecef",
  borderRadius: "4px",
  padding: "10px",
  background: "#fff",
};

const metaChipStyle: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: "999px",
  background: "#f1f3f5",
  color: "#495057",
  fontSize: "12px",
  whiteSpace: "nowrap",
};

const trustColors: Record<string, string> = {
  verified: "#27ae60",
  unreferenced: "#f39c12",
  fabricated: "#c0392b",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "2px solid #ddd",
  padding: "8px 10px",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: "8px 10px",
  verticalAlign: "top",
};
