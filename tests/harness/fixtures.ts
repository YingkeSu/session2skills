/**
 * Shared test fixtures for harness pipeline tests.
 *
 * Follows the inline factory pattern: `make*(overrides?)` with Partial<T>.
 */

import type {
  EvidenceCitation,
  EvidenceItem,
  NormalizedSession,
  WorkflowSignalKind,
} from "../../src/normalize/models.js";
import type {
  ClaimManifest,
  ManifestClaim,
  SkepticIssue,
  SkepticReport,
  VerifierCheckedItem,
  VerifierIssue,
  VerifierReport,
  WriterDirective,
  WriterOutput,
  WriterSection,
} from "../../src/harness/types.js";

// ---------------------------------------------------------------------------
// Evidence factories
// ---------------------------------------------------------------------------

export function makeEvidenceCitation(
  overrides?: Partial<EvidenceCitation>,
): EvidenceCitation {
  return {
    evidenceID: "ev_001",
    sessionID: "ses_test",
    sourceType: "message",
    ...overrides,
  };
}

export function makeEvidenceItem(
  overrides?: Partial<EvidenceItem>,
): EvidenceItem {
  return {
    schemaVersion: "evidence-item/v1",
    evidenceID: "ev_001",
    citation: makeEvidenceCitation(),
    summaryText: "Test evidence item",
    dimensions: ["work-style" as WorkflowSignalKind],
    ...overrides,
  };
}

export function makeEvidenceItems(count: number): Array<EvidenceItem> {
  return Array.from({ length: count }, (_, i) =>
    makeEvidenceItem({
      evidenceID: `ev_${String(i + 1).padStart(3, "0")}`,
      citation: makeEvidenceCitation({
        evidenceID: `ev_${String(i + 1).padStart(3, "0")}`,
      }),
      summaryText: `Evidence item ${i + 1}`,
      dimensions: [
        (["work-style", "communication-style", "validation-habit", "constraint", "token-efficiency", "model-selection", "delegation-pattern"] as const)[
          i % 7
        ],
      ],
    }),
  );
}

// ---------------------------------------------------------------------------
// Manifest factories
// ---------------------------------------------------------------------------

export function makeManifestClaim(
  overrides?: Partial<ManifestClaim>,
): ManifestClaim {
  return {
    id: "claim_001",
    dimension: "work-style",
    label: "analysis-first",
    confidence: 0.8,
    rationale: "Test rationale",
    evidenceRefs: ["ev_001"],
    ...overrides,
  };
}

export function makeClaimManifest(
  overrides?: Partial<ClaimManifest>,
): ClaimManifest {
  return {
    schemaVersion: "claim-manifest/v1",
    claims: [makeManifestClaim()],
    evidenceSummary: "5 test sessions with 20 evidence items",
    dimensionsCovered: ["work-style"],
    metadata: {
      generatedAt: "2026-05-26T00:00:00.000Z",
      sessionCount: 5,
      totalEvidenceItems: 20,
    },
    ...overrides,
  };
}

export function makeMultiDimensionManifest(): ClaimManifest {
  const dimensions: Array<WorkflowSignalKind> = [
    "work-style",
    "communication-style",
    "validation-habit",
    "constraint",
    "token-efficiency",
    "model-selection",
    "delegation-pattern",
  ];

  const claims: Array<ManifestClaim> = dimensions.map((dim, i) =>
    makeManifestClaim({
      id: `claim_${String(i + 1).padStart(3, "0")}`,
      dimension: dim,
      label: getDefaultLabelForDimension(dim),
      confidence: 0.7 + i * 0.02,
      rationale: `Test claim for ${dim}`,
      evidenceRefs: [`ev_${String(i + 1).padStart(3, "0")}`],
    }),
  );

  return makeClaimManifest({
    claims,
    dimensionsCovered: dimensions,
    metadata: {
      generatedAt: "2026-05-26T00:00:00.000Z",
      sessionCount: 5,
      totalEvidenceItems: 7,
    },
  });
}

function getDefaultLabelForDimension(dim: WorkflowSignalKind): string {
  const map: Record<WorkflowSignalKind, string> = {
    "work-style": "analysis-first",
    "communication-style": "concise",
    "validation-habit": "run-tests",
    "constraint": "minimal-diff",
    "token-efficiency": "explorer",
    "model-selection": "cost-conscious",
    "delegation-pattern": "parallelizer",
  };
  return map[dim];
}

// ---------------------------------------------------------------------------
// Skeptic factories
// ---------------------------------------------------------------------------

export function makeSkepticIssue(
  overrides?: Partial<SkepticIssue>,
): SkepticIssue {
  return {
    claimId: "claim_001",
    severity: "medium",
    problemType: "overconfident",
    detail: "Confidence seems too high given limited evidence",
    suggestion: "Reduce confidence to 0.6",
    ...overrides,
  };
}

export function makeSkepticReport(
  overrides?: Partial<SkepticReport>,
): SkepticReport {
  return {
    schemaVersion: "skeptic-report/v1",
    issues: [],
    overallScore: 0.85,
    metadata: {
      generatedAt: "2026-05-26T00:00:00.000Z",
      claimCount: 1,
      issueCount: 0,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Writer factories
// ---------------------------------------------------------------------------

export function makeWriterDirective(
  overrides?: Partial<WriterDirective>,
): WriterDirective {
  return {
    text: "Begin with code inspection before making changes",
    sourceClaimId: "claim_001",
    ...overrides,
  };
}

export function makeWriterSection(
  overrides?: Partial<WriterSection>,
): WriterSection {
  return {
    title: "Workflow",
    summary: "The developer prefers analysis-first approach",
    directives: [makeWriterDirective()],
    groundingClaimIds: ["claim_001"],
    ...overrides,
  };
}

export function makeWriterOutput(
  overrides?: Partial<WriterOutput>,
): WriterOutput {
  return {
    skillMarkdown:
      "# Test SKILL\n\n## Workflow\nThe developer prefers analysis-first approach\n\n- Begin with code inspection before making changes\n",
    sections: [makeWriterSection()],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Verifier factories
// ---------------------------------------------------------------------------

export function makeVerifierCheckedItem(
  overrides?: Partial<VerifierCheckedItem>,
): VerifierCheckedItem {
  return {
    directive: "Begin with code inspection before making changes",
    claimId: "claim_001",
    status: "verified",
    ...overrides,
  };
}

export function makeVerifierIssue(
  overrides?: Partial<VerifierIssue>,
): VerifierIssue {
  return {
    description: "Directive not grounded in manifest claims",
    location: "Workflow section",
    severity: "high",
    ...overrides,
  };
}

export function makeVerifierReport(
  overrides?: Partial<VerifierReport>,
): VerifierReport {
  return {
    schemaVersion: "verifier-report/v1",
    pass: true,
    checkedItems: [makeVerifierCheckedItem()],
    issues: [],
    metadata: {
      generatedAt: "2026-05-26T00:00:00.000Z",
      directiveCount: 1,
      verifiedCount: 1,
      fabricatedCount: 0,
    },
    ...overrides,
  };
}
