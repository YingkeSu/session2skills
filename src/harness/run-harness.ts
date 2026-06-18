import type { LLMTrace } from "../normalize/models.js";
import type { ResolvedLlmProvider } from "../llm/provider.js";
import type { PromptRegistry } from "../llm/prompts/registry.js";
import type { EvidenceItem, NormalizedSession } from "../normalize/models.js";
import type { ClaimManifest, HarnessBudget, HarnessResult, SkepticSeverity } from "./types.js";
import { DEFAULT_HARNESS_BUDGET } from "./types.js";
import { generateTraceID } from "../llm/trace.js";
import { runAnalystStage } from "./analyst.js";
import { runSkepticStage } from "./skeptic.js";
import { buildFallbackMarkdown, runWriterStage } from "./writer.js";
import { runVerifierStage } from "./verifier.js";

export type RunHarnessInput = {
  sessions: ReadonlyArray<NormalizedSession>;
  evidence: ReadonlyArray<EvidenceItem>;
  provider: ResolvedLlmProvider;
  registry?: PromptRegistry;
  tone?: string;
  budget?: Partial<HarnessBudget>;
};

export async function analyzeWithHarness(input: RunHarnessInput): Promise<HarnessResult> {
  const {
    sessions,
    evidence,
    provider,
    registry,
    tone = "balanced",
    budget,
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
    const analystResult = await runAnalystStage(sessions, evidence, provider, registry, budget);
    traces.push(analystResult.trace);
    manifest = analystResult.manifest;
  } catch (error: unknown) {
    traces.push(buildErrorTrace("harness-analyst", error));
    return {
      manifest: emptyManifest,
      traces,
      error: `analyst failed: ${String(error)}`,
      failedStage: "analyst",
    };
  }

  let skepticReport: HarnessResult["skepticReport"];
  let revisedManifest: ClaimManifest;
  try {
    const skepticResult = await runSkepticStage(manifest, evidence, provider, registry, budget);
    traces.push(skepticResult.trace);
    skepticReport = skepticResult.report;
    revisedManifest = applySkepticFeedback(manifest, skepticResult.report.issues);
  } catch (error: unknown) {
    traces.push(buildErrorTrace("harness-skeptic", error));
    skepticReport = undefined;
    revisedManifest = manifest;
  }

  let writerOutput: HarnessResult["writerOutput"];
  try {
    const writerResult = await runWriterStage(revisedManifest, tone, provider, registry, budget, evidence);
    traces.push(writerResult.trace);
    writerOutput = writerResult.output;
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
    );
    traces.push(verifierResult.trace);
    verifierReport = verifierResult.report;
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

function applySkepticFeedback(
  manifest: ClaimManifest,
  issues: Array<{ claimId: string; severity: SkepticSeverity }>,
): ClaimManifest {
  if (issues.length === 0) {
    return manifest;
  }

  const issueMap = new Map(issues.map((issue) => [issue.claimId, issue.severity]));

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
