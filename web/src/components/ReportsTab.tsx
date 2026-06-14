import type { SkepticReport, VerifierReport } from "../runs.js";

type ReportsTabProps = {
  skepticReport: SkepticReport | null;
  verifierReport: VerifierReport | null;
};

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
  const hasSkeptic = skepticReport !== null;
  const hasVerifier = verifierReport !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <section
        style={{
          border: "1px solid #dee2e6",
          borderRadius: "6px",
          padding: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <h3 style={{ margin: 0 }}>Skeptic Report</h3>
          {hasSkeptic && scoreBadge(skepticReport.overallScore)}
        </div>

        {!hasSkeptic ? (
          <p style={{ color: "#666" }}>No skeptic report available.</p>
        ) : (
          <>
            <div
              style={{
                fontSize: "13px",
                color: "#495057",
                marginBottom: "12px",
              }}
            >
              {skepticReport.metadata.issueCount} issue
              {skepticReport.metadata.issueCount === 1 ? "" : "s"} across{" "}
              {skepticReport.metadata.claimCount} claims
            </div>
            {skepticReport.issues.length === 0 ? (
              <p style={{ color: "#28a745" }}>No issues found.</p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                {skepticReport.issues.map((issue, idx) => (
                  <details
                    key={`${issue.claimId}-${issue.problemType}-${idx}`}
                    style={{
                      border: "1px solid #e9ecef",
                      borderRadius: "4px",
                      padding: "10px",
                      background: "#fff",
                    }}
                  >
                    <summary
                      style={{
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        listStyle: "none",
                        justifyContent: "space-between",
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
                          {issue.severity}
                        </span>
                        <strong style={{ fontSize: "13px" }}>
                          {issue.problemType}
                        </strong>
                        <span style={{ fontSize: "12px", color: "#666" }}>
                          claim {issue.claimId}
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
                        <strong>Suggestion:</strong> {issue.suggestion}
                      </p>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section
        style={{
          border: "1px solid #dee2e6",
          borderRadius: "6px",
          padding: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <h3 style={{ margin: 0 }}>Verifier Report</h3>
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
              {verifierReport.pass ? "PASS" : "FAIL"}
            </span>
          )}
        </div>

        {!hasVerifier ? (
          <p style={{ color: "#666" }}>No verifier report available.</p>
        ) : (
          <>
            <div
              style={{
                fontSize: "13px",
                color: "#495057",
                marginBottom: "12px",
              }}
            >
              {verifierReport.metadata.directiveCount} directives checked ·{" "}
              {verifierReport.metadata.verifiedCount} verified ·{" "}
              {verifierReport.metadata.fabricatedCount} fabricated
            </div>

            {verifierReport.issues.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  marginBottom: "16px",
                }}
              >
                {verifierReport.issues.map((issue, idx) => (
                  <details
                    key={`verifier-issue-${idx}`}
                    style={{
                      border: "1px solid #e9ecef",
                      borderRadius: "4px",
                      padding: "10px",
                      background: "#fff",
                    }}
                  >
                    <summary
                      style={{
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        listStyle: "none",
                        justifyContent: "space-between",
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
                          {issue.severity}
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
                    <th style={thStyle}>Directive</th>
                    <th style={thStyle}>Claim</th>
                    <th style={thStyle}>Status</th>
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
                          {item.status}
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
