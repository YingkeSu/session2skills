import type {
  ClaimManifest,
  ManifestEvidenceExcerpt,
  SkepticReport,
  VerifierReport,
} from "../runs.js";
import { EvidencePanel } from "./EvidencePanel.js";
import { VirtualList } from "./VirtualList.js";
import type { JSX } from "react";
import { useLocale } from "../i18n/LocaleContext.js";

type AuditViewTabProps = {
  manifest: ClaimManifest;
  skepticReport: SkepticReport | null;
  verifierReport: VerifierReport | null;
  runName: string;
};

const trustBadge: Record<string, string> = {
  verified: "s2s-badge-success",
  unreferenced: "s2s-badge-warning",
  fabricated: "s2s-badge-danger",
};

const sourceBadge: Record<string, string> = {
  message: "s2s-badge-blue",
  tool: "s2s-badge-teal",
  step: "s2s-badge-violet",
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
    <div className="s2s-stack">
      <section className="s2s-panel">
        <div className="s2s-panel-head">
          <h3 className="s2s-panel-title">{t("audit.evidenceSummary")}</h3>
          <span className="s2s-chip s2s-chip-muted">
            {t("audit.claimCount", { count: manifest.claims.length })}
          </span>
        </div>
        <p className="s2s-lede">{manifest.evidenceSummary}</p>
      </section>

      {manifest.evidence && manifest.evidence.length > 0 && (
        <section className="s2s-panel">
          <div className="s2s-panel-head">
            <h3 className="s2s-panel-title">{t("audit.evidenceExcerpts")}</h3>
          </div>
          <VirtualList
            ariaLabel={t("audit.evidenceExcerpts")}
            itemHeight={evidenceItemHeight}
            overscan={4}
            viewportHeight="none"
            items={manifest.evidence}
            renderItem={(excerpt) => (
              <details
                key={excerpt.evidenceID}
                className="s2s-tile s2s-disclosure"
              >
                <summary>
                  <span className="s2s-tag-row">
                    <span
                      className={`s2s-badge s2s-badge-sm ${
                        sourceBadge[excerpt.sourceType] ?? "s2s-badge-muted"
                      }`}
                    >
                      {tEnum("sourceType", excerpt.sourceType)}
                    </span>
                    <span className="s2s-code-id">{excerpt.evidenceID}</span>
                  </span>
                </summary>
                <pre className="s2s-excerpt">{excerpt.excerpt}</pre>
              </details>
            )}
          />
        </section>
      )}

      <section className="s2s-panel">
        <div className="s2s-panel-head">
          <h3 className="s2s-panel-title">{t("audit.claims")}</h3>
          <span className="s2s-chip s2s-chip-muted">
            {t("audit.dimensionCount", {
              count: manifest.dimensionsCovered.length,
            })}
          </span>
        </div>
        {manifest.dimensionsCovered.length === 0 && (
          <p className="s2s-empty">{t("audit.noClaims")}</p>
        )}
        <div className="s2s-stack s2s-stack-tight">
          {manifest.dimensionsCovered.map((dimension) => {
            const claims = claimsByDimension.get(dimension);
            if (!claims || claims.length === 0) return null;
            return (
              <div key={dimension} className="s2s-tile">
                <div className="s2s-panel-head">
                  <h4 className="s2s-eyebrow">{dimension}</h4>
                  <span className="s2s-chip s2s-chip-muted">
                    {t("audit.claimsInDimension", { count: claims.length })}
                  </span>
                </div>
                <div className="s2s-stack s2s-stack-tight">
                  {claims.map((claim) => {
                    const trustStatus = trustMap.get(claim.id);
                    const issueCount = skepticMap.get(claim.id) ?? 0;
                    return (
                      <div key={claim.id} className="s2s-tile s2s-tile-muted">
                        <div className="s2s-claim-head">
                          <strong className="s2s-claim-label">
                            {claim.label}
                          </strong>
                          <span className="s2s-chip">
                            {Math.round(claim.confidence * 100)}%
                          </span>
                          {trustStatus && (
                            <span
                              className={`s2s-badge s2s-badge-sm ${
                                trustBadge[trustStatus] ?? "s2s-badge-muted"
                              }`}
                            >
                              {tEnum("status", trustStatus)}
                            </span>
                          )}
                          {issueCount > 0 && (
                            <span className="s2s-chip s2s-chip-warning">
                              {t("audit.skepticIssue", { count: issueCount })}
                            </span>
                          )}
                        </div>

                        <div className="s2s-meter-row">
                          <span className="s2s-meter-label">
                            {t("audit.confidence")}
                          </span>
                          <span className="s2s-meter">
                            <span
                              className="s2s-meter-fill"
                              style={{
                                width: `${Math.round(claim.confidence * 100)}%`,
                              }}
                            />
                          </span>
                        </div>

                        <p className="s2s-claim-rationale">{claim.rationale}</p>

                        {claim.evidenceRefs.length > 0 && (
                          <div className="s2s-stack s2s-stack-tighter">
                            {claim.evidenceRefs.map((ref) => {
                              const evidence = evidenceByEvidenceId.get(ref);
                              if (!evidence) {
                                return (
                                  <span
                                    key={ref}
                                    className="s2s-chip s2s-chip-warning"
                                  >
                                    {t("audit.missingEvidence", { ref })}
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

// Collapsed evidence <details> ≈ padding + one-line summary. Estimate only;
// expanded entries overflow their slot without clipping.
const evidenceItemHeight = 44;
