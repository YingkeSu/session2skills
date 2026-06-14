import { describe, expect, it } from "vitest";
import type { ClaimManifest } from "../../src/harness/types.js";
import type { EvidenceItem } from "../../src/normalize/models.js";
import {
  enrichManifestWithEvidence,
  MAX_MANIFEST_EXCERPT_CHARS,
} from "../../src/harness/enrich-evidence.js";
import {
  makeClaimManifest,
  makeEvidenceItem,
  makeEvidenceItems,
  makeManifestClaim,
} from "../harness/fixtures.js";

describe("enrichManifestWithEvidence", () => {
  it("embeds excerpts for every evidenceRef referenced by claims", () => {
    const manifest: ClaimManifest = makeClaimManifest({
      claims: [
        makeManifestClaim({ id: "c1", evidenceRefs: ["ev_001", "ev_002"] }),
        makeManifestClaim({ id: "c2", evidenceRefs: ["ev_003"] }),
      ],
    });
    const evidence: Array<EvidenceItem> = makeEvidenceItems(3);

    const enriched = enrichManifestWithEvidence(manifest, evidence);

    expect(enriched.evidence).toBeDefined();
    expect(enriched.evidence).toHaveLength(3);
    const ids = enriched.evidence!.map((e) => e.evidenceID).sort();
    expect(ids).toEqual(["ev_001", "ev_002", "ev_003"]);
  });

  it("only includes evidence items that are referenced by at least one claim", () => {
    const manifest: ClaimManifest = makeClaimManifest({
      claims: [makeManifestClaim({ evidenceRefs: ["ev_001"] })],
    });
    const evidence: Array<EvidenceItem> = makeEvidenceItems(5);

    const enriched = enrichManifestWithEvidence(manifest, evidence);

    expect(enriched.evidence).toHaveLength(1);
    expect(enriched.evidence![0].evidenceID).toBe("ev_001");
  });

  it("preserves sourceType from the evidence citation", () => {
    const manifest: ClaimManifest = makeClaimManifest({
      claims: [makeManifestClaim({ evidenceRefs: ["ev_001"] })],
    });
    const evidence: Array<EvidenceItem> = [
      makeEvidenceItem({
        evidenceID: "ev_001",
        citation: { evidenceID: "ev_001", sessionID: "ses_test", sourceType: "tool" },
      }),
    ];

    const enriched = enrichManifestWithEvidence(manifest, evidence);

    expect(enriched.evidence![0].sourceType).toBe("tool");
  });

  it("uses summaryText as the excerpt verbatim", () => {
    const manifest: ClaimManifest = makeClaimManifest({
      claims: [makeManifestClaim({ evidenceRefs: ["ev_001"] })],
    });
    const evidence: Array<EvidenceItem> = [
      makeEvidenceItem({ evidenceID: "ev_001", summaryText: "Read three files before editing" }),
    ];

    const enriched = enrichManifestWithEvidence(manifest, evidence);

    expect(enriched.evidence![0].excerpt).toBe("Read three files before editing");
  });

  it("caps excerpts at MAX_MANIFEST_EXCERPT_CHARS characters", () => {
    const longText = "x".repeat(MAX_MANIFEST_EXCERPT_CHARS + 200);
    const manifest: ClaimManifest = makeClaimManifest({
      claims: [makeManifestClaim({ evidenceRefs: ["ev_001"] })],
    });
    const evidence: Array<EvidenceItem> = [
      makeEvidenceItem({ evidenceID: "ev_001", summaryText: longText }),
    ];

    const enriched = enrichManifestWithEvidence(manifest, evidence);

    expect(enriched.evidence![0].excerpt.length).toBeLessThanOrEqual(MAX_MANIFEST_EXCERPT_CHARS);
    expect(enriched.evidence![0].excerpt.endsWith("...")).toBe(true);
  });

  it("returns manifest with empty evidence array when no claims reference evidence", () => {
    const manifest: ClaimManifest = makeClaimManifest({
      claims: [makeManifestClaim({ evidenceRefs: [] })],
    });
    const evidence: Array<EvidenceItem> = makeEvidenceItems(3);

    const enriched = enrichManifestWithEvidence(manifest, evidence);

    expect(enriched.evidence).toEqual([]);
  });

  it("does not mutate the input manifest", () => {
    const manifest: ClaimManifest = makeClaimManifest({
      claims: [makeManifestClaim({ evidenceRefs: ["ev_001"] })],
    });
    const evidence: Array<EvidenceItem> = makeEvidenceItems(1);

    enrichManifestWithEvidence(manifest, evidence);

    expect(manifest.evidence).toBeUndefined();
  });

  it("handles referenced evidenceIDs missing from the evidence array", () => {
    const manifest: ClaimManifest = makeClaimManifest({
      claims: [
        makeManifestClaim({ evidenceRefs: ["ev_001", "ev_MISSING"] }),
      ],
    });
    const evidence: Array<EvidenceItem> = [
      makeEvidenceItem({ evidenceID: "ev_001" }),
    ];

    const enriched = enrichManifestWithEvidence(manifest, evidence);

    expect(enriched.evidence).toHaveLength(1);
    expect(enriched.evidence![0].evidenceID).toBe("ev_001");
  });

  it("deduplicates evidence when multiple claims reference the same evidenceID", () => {
    const manifest: ClaimManifest = makeClaimManifest({
      claims: [
        makeManifestClaim({ id: "c1", evidenceRefs: ["ev_001", "ev_002"] }),
        makeManifestClaim({ id: "c2", evidenceRefs: ["ev_001", "ev_003"] }),
      ],
    });
    const evidence: Array<EvidenceItem> = makeEvidenceItems(3);

    const enriched = enrichManifestWithEvidence(manifest, evidence);

    const ids = enriched.evidence!.map((e) => e.evidenceID);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });
});
