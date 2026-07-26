import type { SkepticReport, VerifierReport } from "../runs.js";
import { useLocale } from "../i18n/LocaleContext.js";
import { RawJsonDrawer } from "./RawJsonDrawer.js";

type ReportsTabProps = {
  skepticReport: SkepticReport | null;
  verifierReport: VerifierReport | null;
};

import type { JSX } from "react";

function scoreBadgeClass(score: number): string {
  if (score >= 0.8) return "s2s-badge-success";
  if (score >= 0.5) return "s2s-badge-warning";
  return "s2s-badge-danger";
}

function severityBadgeClass(severity: "high" | "medium" | "low"): string {
  if (severity === "high") return "s2s-badge-danger";
  if (severity === "medium") return "s2s-badge-warning";
  return "s2s-badge-accent";
}

const trustBadge: Record<string, string> = {
  verified: "s2s-badge-success",
  unreferenced: "s2s-badge-warning",
  fabricated: "s2s-badge-danger",
};

export function ReportsTab({
  skepticReport,
  verifierReport,
}: ReportsTabProps): JSX.Element {
  const { t, tEnum } = useLocale();
  const hasSkeptic = skepticReport !== null;
  const hasVerifier = verifierReport !== null;

  return (
    <div className="s2s-stack">
      <section className="s2s-panel">
        <div className="s2s-panel-head">
          <h3 className="s2s-panel-title">{t("reports.skepticTitle")}</h3>
          {hasSkeptic && (
            <>
              <span
                className={`s2s-badge ${scoreBadgeClass(skepticReport.overallScore)}`}
              >
                {(skepticReport.overallScore * 100).toFixed(0)}%
              </span>
              <RawJsonDrawer value={skepticReport} testId="raw-skeptic-report" />
            </>
          )}
        </div>

        {!hasSkeptic ? (
          <p className="s2s-empty">{t("reports.noSkeptic")}</p>
        ) : (
          <>
            <p className="s2s-lede">
              {t("reports.skepticSummary", {
                count: skepticReport.metadata.issueCount,
                claims: skepticReport.metadata.claimCount,
              })}
            </p>
            {skepticReport.issues.length === 0 ? (
              <p className="s2s-ok">{t("reports.noIssues")}</p>
            ) : (
              <div className="s2s-stack s2s-stack-tighter">
                {skepticReport.issues.map((issue, idx) => (
                  <details
                    key={`${issue.claimId}-${issue.problemType}-${idx}`}
                    className="s2s-tile s2s-disclosure"
                  >
                    <summary>
                      <span className="s2s-tag-row">
                        <span
                          className={`s2s-badge s2s-badge-sm ${severityBadgeClass(
                            issue.severity,
                          )}`}
                        >
                          {tEnum("severity", issue.severity)}
                        </span>
                        <strong className="s2s-issue-title">
                          {issue.problemType}
                        </strong>
                        <span className="s2s-chip s2s-chip-muted">
                          {t("reports.claimLabel", { id: issue.claimId })}
                        </span>
                      </span>
                    </summary>
                    <div className="s2s-disclosure-body">
                      <p className="s2s-issue-detail">{issue.detail}</p>
                      <p className="s2s-issue-suggestion">
                        <strong>{t("reports.suggestion")}</strong>{" "}
                        {issue.suggestion}
                      </p>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="s2s-panel">
        <div className="s2s-panel-head">
          <h3 className="s2s-panel-title">{t("reports.verifierTitle")}</h3>
          {hasVerifier && (
            <>
              <span
                className={`s2s-badge ${
                  verifierReport.pass ? "s2s-badge-success" : "s2s-badge-danger"
                }`}
              >
                {verifierReport.pass ? t("badge.pass") : t("badge.fail")}
              </span>
              <RawJsonDrawer value={verifierReport} testId="raw-verifier-report" />
            </>
          )}
        </div>

        {!hasVerifier ? (
          <p className="s2s-empty">{t("reports.noVerifier")}</p>
        ) : (
          <>
            <p className="s2s-lede">
              {t("reports.verifierSummary", {
                directives: verifierReport.metadata.directiveCount,
                verified: verifierReport.metadata.verifiedCount,
                fabricated: verifierReport.metadata.fabricatedCount,
              })}
            </p>

            {verifierReport.issues.length > 0 && (
              <div
                className="s2s-stack s2s-stack-tighter"
                style={{ marginBottom: "var(--space-3)" }}
              >
                {verifierReport.issues.map((issue, idx) => (
                  <details
                    key={`verifier-issue-${idx}`}
                    className="s2s-tile s2s-disclosure"
                  >
                    <summary>
                      <span className="s2s-tag-row">
                        <span
                          className={`s2s-badge s2s-badge-sm ${severityBadgeClass(
                            issue.severity,
                          )}`}
                        >
                          {tEnum("severity", issue.severity)}
                        </span>
                        <strong className="s2s-issue-title">
                          {issue.location}
                        </strong>
                      </span>
                    </summary>
                    <div className="s2s-disclosure-body">
                      <p className="s2s-issue-detail">{issue.description}</p>
                    </div>
                  </details>
                ))}
              </div>
            )}

            <div className="s2s-table-wrap">
              <table className="s2s-table">
                <thead>
                  <tr>
                    <th>{t("reports.directive")}</th>
                    <th>{t("reports.claim")}</th>
                    <th>{t("reports.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {verifierReport.checkedItems.map((item, idx) => (
                    <tr key={`checked-${idx}`}>
                      <td>{item.directive}</td>
                      <td>{item.claimId ?? "—"}</td>
                      <td>
                        <span
                          className={`s2s-badge s2s-badge-sm ${
                            trustBadge[item.status] ?? "s2s-badge-muted"
                          }`}
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
