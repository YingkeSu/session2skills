import type { LLMTrace } from "../normalize/models.js";
import type { ResolvedLlmProvider } from "../llm/provider.js";
import type { PromptRegistry } from "../llm/prompts/registry.js";
import type { EvidenceItem, NormalizedSession } from "../normalize/models.js";
import type { ClaimManifest, HarnessBudget, HarnessResult, SkepticSeverity } from "./types.js";
import type { EvidenceConfig } from "./packets.js";
import { generateTraceID } from "../llm/trace.js";
import { runAnalystStage } from "./analyst.js";
import { runSkepticStage } from "./skeptic.js";
import { buildFallbackMarkdown, runWriterStage } from "./writer.js";
import { runVerifierStage } from "./verifier.js";
import { selectEvidenceForBudget } from "./evidence-index.js";
import { DEFAULT_EVIDENCE_CONFIG } from "./packets.js";

export type HarnessStageName = "analyst" | "skeptic" | "writer" | "verifier";

export type RunHarnessInput = {
  sessions: ReadonlyArray<NormalizedSession>;
  evidence: ReadonlyArray<EvidenceItem>;
  provider: ResolvedLlmProvider;
  registry?: PromptRegistry;
  tone?: string;
  budget?: Partial<HarnessBudget>;
  templateMarkdown?: string;
  selectedDimensions?: ReadonlyArray<string>;
  skillTypeFocus?: string;
  evidenceConfig?: EvidenceConfig;
  onStageComplete?: (stage: HarnessStageName) => void;
};

export async function analyzeWithHarness(input: RunHarnessInput): Promise<HarnessResult> {
  const {
    sessions,
    evidence,
    provider,
    registry,
    tone = "balanced",
    budget,
    templateMarkdown,
    selectedDimensions,
    skillTypeFocus,
    evidenceConfig,
    onStageComplete,
  } = input;

  const traces: Array<LLMTrace> = [];
  const emptyManifest: ClaimManifest = {
    schemaVersion: "claim-manifest/v1",
    claims: [],
    evidenceSummary: "",
    dimensionsCovered: [],
    metadata: {
      generatedAt: new Date().toISOString(),
      sessionCount: sessions.length,
      totalEvidenceItems: evidence.length,
    },
  };

  let manifest: ClaimManifest;
  try {
    const analystResult = await runAnalystStage(sessions, evidence, provider, registry, budget, selectedDimensions, evidenceConfig);
    traces.push(analystResult.trace);
    manifest = analystResult.manifest;
    onStageComplete?.("analyst");
  } catch (error: unknown) {
    traces.push(buildErrorTrace("harness-analyst", error));
    return {
      manifest: emptyManifest,
      traces,
      error: `analyst failed: ${String(error)}`,
      failedStage: "analyst",
    };
  }

  if (manifest.claims.length === 0) {
    return {
      manifest,
      revisedManifest: manifest,
      writerOutput: { skillMarkdown: "", sections: [] },
      traces,
    };
  }

  const selectedEvidence = selectEvidenceForBudget(
    [...evidence],
    DEFAULT_EVIDENCE_CONFIG.tokenBudget,
    { preferDirectUser: true, maxItems: DEFAULT_EVIDENCE_CONFIG.maxItems },
  );

  const skepticClaimsJson = JSON.stringify(
    {
      claims: manifest.claims.map((c) => ({
        id: c.id,
        dimension: c.dimension,
        label: c.label,
        confidence: c.confidence,
        rationale: c.rationale,
        evidenceRefs: c.evidenceRefs,
      })),
    },
    null,
    2,
  );

  let skepticReport: HarnessResult["skepticReport"];
  let revisedManifest: ClaimManifest;
  try {
    const skepticResult = await runSkepticStage(manifest, evidence, provider, registry, budget, selectedEvidence, skepticClaimsJson);
    traces.push(skepticResult.trace);
    skepticReport = skepticResult.report;
    revisedManifest = applySkepticFeedback(manifest, skepticResult.report.issues);
    onStageComplete?.("skeptic");
  } catch (error: unknown) {
    traces.push(buildErrorTrace("harness-skeptic", error));
    skepticReport = undefined;
    revisedManifest = manifest;
  }

  const revisedClaimsJson = JSON.stringify(
    revisedManifest.claims.map((c) => ({
      id: c.id,
      dimension: c.dimension,
      label: c.label,
      confidence: c.confidence,
      rationale: c.rationale,
      evidenceRefs: c.evidenceRefs,
    })),
    null,
    2,
  );

  let writerOutput: HarnessResult["writerOutput"];
  try {
    const writerResult = await runWriterStage(revisedManifest, tone, provider, registry, budget, evidence, templateMarkdown, skillTypeFocus, selectedEvidence);
    traces.push(writerResult.trace);
    writerOutput = writerResult.output;
    onStageComplete?.("writer");
  } catch (error: unknown) {
    traces.push(buildErrorTrace("harness-writer", error));
    const fallbackMarkdown = buildFallbackMarkdown(revisedManifest);
    writerOutput = {
      skillMarkdown: fallbackMarkdown,
      sections: [],
    };
  }

  let verifierReport: HarnessResult["verifierReport"];
  try {
    const verifierResult = await runVerifierStage(
      writerOutput.skillMarkdown,
      revisedManifest,
      provider,
      registry,
      budget,
      revisedClaimsJson,
    );
    traces.push(verifierResult.trace);
    verifierReport = verifierResult.report;
    onStageComplete?.("verifier");
  } catch (error: unknown) {
    traces.push(buildErrorTrace("harness-verifier", error));
    verifierReport = undefined;
  }

  const failedStage = !skepticReport ? "skeptic"
    : !verifierReport ? "verifier"
    : undefined;

  const error = failedStage
    ? `${failedStage} failed: see traces`
    : undefined;

  return {
    manifest,
    skepticReport,
    writerOutput,
    verifierReport,
    revisedManifest,
    traces,
    ...(error ? { error, failedStage } : {}),
  };
}

const severityRank: Record<SkepticSeverity, number> = { high: 3, medium: 2, low: 1 };

function applySkepticFeedback(
  manifest: ClaimManifest,
  issues: Array<{ claimId: string; severity: SkepticSeverity }>,
): ClaimManifest {
  if (issues.length === 0) {
    return manifest;
  }

  const issueMap = new Map<string, SkepticSeverity>();
  for (const issue of issues) {
    const existing = issueMap.get(issue.claimId);
    if (!existing || severityRank[issue.severity] > severityRank[existing]) {
      issueMap.set(issue.claimId, issue.severity);
    }
  }

  const revisedClaims = manifest.claims
    .filter((claim) => {
      const severity = issueMap.get(claim.id);
      return severity !== "high";
    })
    .map((claim) => {
      const severity = issueMap.get(claim.id);
      if (severity === "medium") {
        return { ...claim, confidence: Math.max(0.1, claim.confidence - 0.15) };
      }
      return claim;
    });

  const dimensionsCovered = [...new Set(revisedClaims.map((c) => c.dimension))] as ClaimManifest["dimensionsCovered"];

  return {
    ...manifest,
    claims: revisedClaims,
    dimensionsCovered,
  };
}

function buildErrorTrace(stage: string, error: unknown): LLMTrace {
  return {
    schemaVersion: "llm-trace/v1",
    traceID: generateTraceID(),
    timestamp: new Date().toISOString(),
    promptSetVersion: "prompt-set/v1",
    stage: stage as LLMTrace["stage"],
    provider: "",
    model: "",
    inputArtifactRef: `harness:${stage}:error`,
    request: { promptName: "", messages: [] },
    response: { finishReason: "error", rawText: String(error) },
    usage: {},
  };
}
