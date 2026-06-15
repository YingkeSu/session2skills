import type {
  ClaimManifest,
  ManifestEvidenceExcerpt,
  SkepticReport,
  VerifierReport,
} from "../runs.js";
import { EvidencePanel } from "./EvidencePanel.js";
import { useLocale } from "../i18n/LocaleContext.js";

type AuditViewTabProps = {
  manifest: ClaimManifest;
  skepticReport: SkepticReport | null;
  verifierReport: VerifierReport | null;
  runName: string;
};

const trustColors: Record<string, string> = {
  verified: "#27ae60",
  unreferenced: "#f39c12",
  fabricated: "#c0392b",
};

function buildTrustMap(
  verifierReport: VerifierReport | null
): Map<string, string> {
  const map = new Map<string, string>();
  if (!verifierReport) return map;
  for (const item of verifierReport.checkedItems) {
    if (item.claimId) {
      map.set(item.claimId, item.status);
    }
  }
  return map;
}

function buildSkepticIssueMap(
  skepticReport: SkepticReport | null
): Map<string, number> {
  const map = new Map<string, number>();
  if (!skepticReport) return map;
  for (const issue of skepticReport.issues) {
    map.set(issue.claimId, (map.get(issue.claimId) ?? 0) + 1);
  }
  return map;
}

export function AuditViewTab({
  manifest,
  skepticReport,
  verifierReport,
  runName,
}: AuditViewTabProps): JSX.Element {
  const { t, tEnum } = useLocale();
  const trustMap = buildTrustMap(verifierReport);
  const skepticMap = buildSkepticIssueMap(skepticReport);

  const claimsByDimension = new Map<string, typeof manifest.claims>();
  for (const claim of manifest.claims) {
    const list = claimsByDimension.get(claim.dimension);
    if (list) {
      list.push(claim);
    } else {
      claimsByDimension.set(claim.dimension, [claim]);
    }
  }

  const evidenceByEvidenceId = new Map<string, ManifestEvidenceExcerpt>();
  if (manifest.evidence) {
    for (const item of manifest.evidence) {
      evidenceByEvidenceId.set(item.evidenceID, item);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <section>
        <h3 style={{ margin: "0 0 8px" }}>{t("audit.evidenceSummary")}</h3>
        <p style={{ color: "#555", lineHeight: 1.6 }}>
          {manifest.evidenceSummary}
        </p>
      </section>

      {manifest.evidence && manifest.evidence.length > 0 && (
        <section>
          <h3 style={{ margin: "0 0 8px" }}>{t("audit.evidenceExcerpts")}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {manifest.evidence.map((excerpt) => (
              <details
                key={excerpt.evidenceID}
                style={detailsStyle}
              >
                <summary style={summaryStyle}>
                  <strong>{excerpt.evidenceID}</strong>
                  <span
                    style={{
                      marginLeft: "8px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: "#e9ecef",
                      fontSize: "12px",
                      color: "#495057",
                    }}
                  >
                    {tEnum("sourceType", excerpt.sourceType)}
                  </span>
                </summary>
                <pre
                  style={{
                    margin: "8px 0 0",
                    padding: "10px",
                    background: "#f8f9fa",
                    borderRadius: "4px",
                    fontSize: "13px",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {excerpt.excerpt}
                </pre>
              </details>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 style={{ margin: "0 0 12px" }}>{t("audit.claims")}</h3>
        {manifest.dimensionsCovered.length === 0 && (
          <p style={{ color: "#666" }}>{t("audit.noClaims")}</p>
        )}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          {manifest.dimensionsCovered.map((dimension) => {
            const claims = claimsByDimension.get(dimension);
            if (!claims || claims.length === 0) return null;
            return (
              <div
                key={dimension}
                style={{
                  border: "1px solid #dee2e6",
                  borderRadius: "6px",
                  padding: "12px",
                }}
              >
                <h4
                  style={{
                    margin: "0 0 10px",
                    fontSize: "14px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "#495057",
                  }}
                >
                  {dimension}
                </h4>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {claims.map((claim) => {
                    const trustStatus = trustMap.get(claim.id);
                    const issueCount = skepticMap.get(claim.id) ?? 0;
                    return (
                      <div
                        key={claim.id}
                        style={{
                          border: "1px solid #e9ecef",
                          borderRadius: "4px",
                          padding: "10px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            flexWrap: "wrap",
                          }}
                        >
                          <strong style={{ fontSize: "14px" }}>
                            {claim.label}
                          </strong>
                          {trustStatus && (
                            <span
                              style={{
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "12px",
                                color: "#fff",
                                background:
                                  trustColors[trustStatus] ?? "#6c757d",
                              }}
                            >
                              {tEnum("status", trustStatus)}
                            </span>
                          )}
                          {issueCount > 0 && (
                            <span
                              style={{
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "12px",
                                background: "#fff3cd",
                                color: "#856404",
                              }}
                            >
                              {t("audit.skepticIssue", { count: issueCount })}
                            </span>
                          )}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginTop: "6px",
                            fontSize: "12px",
                            color: "#495057",
                          }}
                        >
                          <span>{t("audit.confidence")}</span>
                          <div
                            style={{
                              flex: 1,
                              height: "8px",
                              background: "#e9ecef",
                              borderRadius: "4px",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                width: `${Math.round(claim.confidence * 100)}%`,
                                background: "#0d6efd",
                              }}
                            />
                          </div>
                          <span>
                            {Math.round(claim.confidence * 100)}%
                          </span>
                        </div>

                        <p
                          style={{
                            margin: "6px 0 0",
                            fontSize: "13px",
                            color: "#212529",
                            lineHeight: 1.5,
                          }}
                        >
                          {claim.rationale}
                        </p>

                        {claim.evidenceRefs.length > 0 && (
                          <div
                            style={{
                              marginTop: "6px",
                              display: "flex",
                              flexDirection: "column",
                              gap: "4px",
                            }}
                          >
                            {claim.evidenceRefs.map((ref) => {
                              const evidence = evidenceByEvidenceId.get(ref);
                              if (!evidence) {
                                return (
                                  <span
                                    key={ref}
                                    style={{
                                      padding: "2px 6px",
                                      borderRadius: "4px",
                                      background: "#e7f1ff",
                                      color: "#084298",
                                      fontSize: "12px",
                                    }}
                                  >
                                    {ref}
                                  </span>
                                );
                              }
                              return (
                                <EvidencePanel
                                  key={ref}
                                  evidenceId={evidence.evidenceID}
                                  excerpt={evidence.excerpt}
                                  sourceType={evidence.sourceType}
                                  runName={runName}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const detailsStyle: React.CSSProperties = {
  border: "1px solid #dee2e6",
  borderRadius: "4px",
  padding: "8px 10px",
  background: "#fff",
};

const summaryStyle: React.CSSProperties = {
  cursor: "pointer",
  listStyle: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};
