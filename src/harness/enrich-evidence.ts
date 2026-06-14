import type {
  ClaimManifest,
  ManifestEvidenceExcerpt,
} from "./types.js";
import type { EvidenceItem } from "../normalize/models.js";

export const MAX_MANIFEST_EXCERPT_CHARS = 500;

function truncateExcerpt(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const cutoff = trimmed.lastIndexOf(" ", maxChars - 3);
  const sliceEnd = cutoff > maxChars * 0.6 ? cutoff : maxChars - 3;
  return trimmed.slice(0, sliceEnd) + "...";
}

function collectReferencedEvidenceIds(manifest: ClaimManifest): Set<string> {
  const ids = new Set<string>();
  for (const claim of manifest.claims) {
    for (const ref of claim.evidenceRefs) {
      ids.add(ref);
    }
  }
  return ids;
}

export function enrichManifestWithEvidence(
  manifest: ClaimManifest,
  evidence: ReadonlyArray<EvidenceItem>,
): ClaimManifest {
  const referencedIds = collectReferencedEvidenceIds(manifest);

  const lookup = new Map<string, EvidenceItem>();
  for (const item of evidence) {
    if (referencedIds.has(item.evidenceID)) {
      lookup.set(item.evidenceID, item);
    }
  }

  const excerpts: Array<ManifestEvidenceExcerpt> = [];
  for (const id of referencedIds) {
    const item = lookup.get(id);
    if (!item) continue;
    excerpts.push({
      evidenceID: item.evidenceID,
      sourceType: item.citation.sourceType,
      excerpt: truncateExcerpt(item.summaryText, MAX_MANIFEST_EXCERPT_CHARS),
    });
  }

  return { ...manifest, evidence: excerpts };
}
