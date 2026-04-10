import type {
  CandidateClaim,
  NormalizedSession,
  ToolInvocation,
  ValidationHabitLabel,
} from "../normalize/models.js";

import {
  confidenceFromCount,
  createRuleClaim,
  toCitations,
} from "./helpers.js";

const TEST_PATTERN = /(pytest|vitest|jest|npm run test|pnpm test|yarn test|cargo test|go test|bun test)/i;
const DIAGNOSTIC_PATTERN = /(typecheck|tsc --noEmit|lint|diagnostic|diagnostics|lsp_diagnostics)/i;
const GIT_STATE_PATTERN = /(git status|git diff)/i;

const EXTRACTOR_ID = "extract-validation-habits";

export function extractValidationHabitClaims(sessions: Array<NormalizedSession>): Array<CandidateClaim<"validation-habit">> {
  const toolInvocations = sessions.flatMap((session) => session.toolInvocations);
  const totalTools = toolInvocations.length || 1;
  const testsEvidence = collectEvidence(toolInvocations, (tool) => matchesTool(tool, TEST_PATTERN));
  const diagnosticsEvidence = collectEvidence(toolInvocations, (tool) => tool.toolName === "lsp_diagnostics" || matchesTool(tool, DIAGNOSTIC_PATTERN));
  const gitStateEvidence = collectEvidence(toolInvocations, (tool) => matchesTool(tool, GIT_STATE_PATTERN));
  const claims: Array<CandidateClaim<"validation-habit">> = [];

  if (testsEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "run-tests",
      "validation-habit",
      "run-tests" as ValidationHabitLabel,
      confidenceFromCount(testsEvidence.length, totalTools),
      `Test execution detected in ${testsEvidence.length} tool invocation(s)`,
      toCitations(testsEvidence),
    ));
  }

  if (diagnosticsEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "run-diagnostics",
      "validation-habit",
      "run-diagnostics" as ValidationHabitLabel,
      confidenceFromCount(diagnosticsEvidence.length, totalTools),
      `Diagnostic tool usage detected in ${diagnosticsEvidence.length} tool invocation(s)`,
      toCitations(diagnosticsEvidence),
    ));
  }

  if (gitStateEvidence.length > 0) {
    claims.push(createRuleClaim(
      EXTRACTOR_ID,
      "check-git-state",
      "validation-habit",
      "check-git-state" as ValidationHabitLabel,
      confidenceFromCount(gitStateEvidence.length, totalTools),
      `Git state checking detected in ${gitStateEvidence.length} tool invocation(s)`,
      toCitations(gitStateEvidence),
    ));
  }

  return claims.sort((a, b) => b.confidence - a.confidence);
}

function matchesTool(tool: ToolInvocation, pattern: RegExp): boolean {
  const inputText = JSON.stringify(tool.input ?? {});
  const outputText = tool.output ?? "";

  return pattern.test(tool.toolName) || pattern.test(inputText) || pattern.test(outputText);
}

function collectEvidence(
  toolInvocations: Array<ToolInvocation>,
  predicate: (tool: ToolInvocation) => boolean,
) {
  return toolInvocations.filter(predicate).map((tool) => tool.evidence);
}
