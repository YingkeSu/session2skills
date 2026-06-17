import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type SeededRunFixture = {
  runsRoot: string;
  runName: string;
};

const seededRun = {
  name: "alpha-run",
  model: "glm-4.7",
  generatedAt: "2026-06-14T12:00:00.000Z",
  claimManifest: {
    schemaVersion: "claim-manifest/v1",
    claims: [
      {
        id: "c1",
        dimension: "planning",
        label: "Clarify constraints before editing",
        confidence: 0.84,
        rationale:
          "The user explicitly asks the worker to read task constraints before implementation.",
        evidenceRefs: ["ev-1"],
      },
      {
        id: "c2",
        dimension: "verification",
        label: "Run focused checks after changes",
        confidence: 0.91,
        rationale:
          "The task packet requires focused e2e verification after changing fixture coverage.",
        evidenceRefs: ["ev-2"],
      },
      {
        id: "c3",
        dimension: "verification",
        label: "Report commands and results",
        confidence: 0.78,
        rationale:
          "The handoff format asks for command results in the final response and completion report.",
        evidenceRefs: [],
      },
    ],
    evidenceSummary:
      "The session shows a repeated preference for constraint-first implementation and focused verification.",
    dimensionsCovered: ["planning", "verification"],
    evidence: [
      {
        evidenceID: "ev-1",
        sourceType: "message",
        excerpt:
          "Constraint-first short preview; full evidence text loaded by the expandable evidence panel.",
      },
      {
        evidenceID: "ev-2",
        sourceType: "tool",
        excerpt:
          "Focused e2e command output confirms the serve flow after fixture updates.",
      },
    ],
    metadata: {
      generatedAt: "2026-06-14T12:00:00.000Z",
      sessionCount: 2,
      totalEvidenceItems: 5,
    },
  },
  skepticReport: {
    schemaVersion: "skeptic-report/v1",
    issues: [
      {
        claimId: "c1",
        severity: "medium",
        problemType: "thin-evidence",
        detail: "Only one direct excerpt supports the planning claim.",
        suggestion: "Keep the directive narrow and tie it to explicit task packets.",
      },
    ],
    overallScore: 0.72,
    metadata: {
      generatedAt: "2026-06-14T12:00:00.000Z",
      claimCount: 3,
      issueCount: 1,
    },
  },
  verifierReport: {
    schemaVersion: "verifier-report/v1",
    pass: true,
    checkedItems: [
      {
        directive: "Ask for constraints before touching files.",
        claimId: "c1",
        status: "verified",
      },
      {
        directive: "Run focused tests after each e2e fixture change.",
        claimId: "c2",
        status: "verified",
      },
      {
        directive: "Include command outcomes in the completion report.",
        claimId: "c3",
        status: "verified",
      },
    ],
    issues: [],
    metadata: {
      generatedAt: "2026-06-14T12:00:00.000Z",
      directiveCount: 3,
      verifiedCount: 3,
      fabricatedCount: 0,
    },
  },
  traces: [
    {
      schemaVersion: "llm-trace/v1",
      traceID: "t1",
      model: "glm-4.7",
      stage: "analyst",
      provider: "zhipuai",
      usage: { prompt_tokens: 30, completion_tokens: 12, total_tokens: 42 },
      latencyMs: 1200,
      finishReason: "stop",
      promptName: "claim-analysis",
      request: { promptName: "claim-analysis", messages: [] },
      response: { finishReason: "stop" },
    },
  ],
  writerSections: {
    sections: [
      {
        title: "Constraints and anti-patterns",
        summary: "Keep directives grounded in observed evidence.",
        groundingClaimIds: ["c1", "c2"],
        directives: [
          {
            text: "Use evidence before generalizing.",
            sourceClaimId: "c2",
          },
        ],
      },
    ],
  },
  skillMarkdown: "# Alpha Skill\n\n- Use evidence before generalizing.\n",
  evidenceDetails: [
    {
      evidenceID: "ev-1",
      sourceType: "message",
      excerpt:
        "Constraint-first short preview; full evidence text loaded by the expandable evidence panel.",
    },
    {
      evidenceID: "ev-2",
      sourceType: "tool",
      excerpt:
        "Focused e2e command output confirms the serve flow after fixture updates.",
    },
  ],
} as const;

export async function seedBrowserFixtureRun(
  seed: SeededRunFixture,
): Promise<void> {
  const runsDir = join(seed.runsRoot, seed.runName);
  await mkdir(runsDir, { recursive: true });

  await writeFile(
    join(runsDir, "claim-manifest.json"),
    JSON.stringify(seededRun.claimManifest),
  );
  await writeFile(
    join(runsDir, "skeptic-report.json"),
    JSON.stringify(seededRun.skepticReport),
  );
  await writeFile(
    join(runsDir, "verifier-report.json"),
    JSON.stringify(seededRun.verifierReport),
  );
  await writeFile(
    join(runsDir, "llm-traces.json"),
    JSON.stringify(seededRun.traces),
  );
  await writeFile(
    join(runsDir, "writer-output.json"),
    JSON.stringify(seededRun.writerSections),
  );
  await writeFile(join(runsDir, "SKILL.md"), seededRun.skillMarkdown);
}

export function getSeededBrowserFixtureRun(): {
  runName: string;
  model: string;
  generatedAt: string;
  claimCount: number;
  skepticScore: number;
  skepticIssueCount: number;
  evidenceDetails: ReadonlyArray<{
    evidenceID: string;
    sourceType: string;
    excerpt: string;
  }>;
} {
  return {
    runName: seededRun.name,
    model: seededRun.model,
    generatedAt: seededRun.generatedAt,
    claimCount: seededRun.claimManifest.claims.length,
    skepticScore: seededRun.skepticReport.overallScore,
    skepticIssueCount: seededRun.skepticReport.issues.length,
    evidenceDetails: seededRun.evidenceDetails,
  };
}
