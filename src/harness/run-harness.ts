import type { LLMTrace } from "../normalize/models.js";
import type { ResolvedLlmProvider } from "../llm/provider.js";
import type { PromptRegistry } from "../llm/prompts/registry.js";
import type { EvidenceItem, NormalizedSession } from "../normalize/models.js";
import type { ClaimManifest, HarnessBudget, HarnessResult, SkepticSeverity } from "./types.js";
import { DEFAULT_HARNESS_BUDGET } from "./types.js";
import { runAnalystStage } from "./analyst.js";
import { runSkepticStage } from "./skeptic.js";
import { runWriterStage } from "./writer.js";
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

  const analystResult = await runAnalystStage(sessions, evidence, provider, registry, budget);
  traces.push(analystResult.trace);

  const skepticResult = await runSkepticStage(
    analystResult.manifest,
    evidence,
    provider,
    registry,
    budget,
  );
  traces.push(skepticResult.trace);

  const revisedManifest = applySkepticFeedback(analystResult.manifest, skepticResult.report.issues);

  const writerResult = await runWriterStage(revisedManifest, tone, provider, registry, budget);
  traces.push(writerResult.trace);

  const verifierResult = await runVerifierStage(
    writerResult.output.skillMarkdown,
    revisedManifest,
    provider,
    registry,
    budget,
  );
  traces.push(verifierResult.trace);

  return {
    manifest: analystResult.manifest,
    skepticReport: skepticResult.report,
    writerOutput: writerResult.output,
    verifierReport: verifierResult.report,
    revisedManifest,
    traces,
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
