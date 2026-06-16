import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { writeGeneratedArtifacts } from "../src/persist/generated-artifacts.js";
import type { LLMTrace } from "../src/normalize/models.js";

async function tmpDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "session2skills-persist-"));
}

const TRACE_WITH_PRIVATE_CONTENT: LLMTrace = {
  schemaVersion: "llm-trace/v1",
  traceID: "trace_private",
  timestamp: new Date().toISOString(),
  promptSetVersion: "prompt-set/v1",
  stage: "session-claims",
  provider: "mock",
  model: "mock-model",
  request: {
    promptName: "extract-session-claims",
    messages: [
      { role: "system", content: "system prompt with private policy" },
      { role: "user", content: "SECRET_TOKEN=abc123\nsource code payload" },
    ],
  },
  response: {
    finishReason: "stop",
    rawText: "{\"private\":\"raw model output\"}",
  },
};

const MINIMAL_CLAIM_MANIFEST = {
  schemaVersion: "claim-manifest/v1" as const,
  claims: [],
  evidenceSummary: "",
  dimensionsCovered: [],
  metadata: {
    generatedAt: new Date().toISOString(),
    sessionCount: 0,
    totalEvidenceItems: 0,
  },
};

const MINIMAL_SKEPTIC_REPORT = {
  schemaVersion: "skeptic-report/v1" as const,
  issues: [],
  overallScore: 1,
  metadata: {
    generatedAt: new Date().toISOString(),
    claimCount: 0,
    issueCount: 0,
  },
};

const MINIMAL_VERIFIER_REPORT = {
  schemaVersion: "verifier-report/v1" as const,
  pass: true,
  checkedItems: [],
  issues: [],
  metadata: {
    generatedAt: new Date().toISOString(),
    directiveCount: 0,
    verifiedCount: 0,
    fabricatedCount: 0,
  },
};

const VALID_SKILL = `---
name: workflow-style
description: Use when adapting to this user's observed coding workflow.
---

# Workflow Style
`;

describe("writeGeneratedArtifacts", () => {
  it("redacts trace prompt content and raw output by default", async () => {
    const dir = await tmpDir();
    const result = await writeGeneratedArtifacts({
      outputDirectory: dir,
      summary: "# Summary",
      skill: VALID_SKILL,
      claimManifest: MINIMAL_CLAIM_MANIFEST,
      skepticReport: MINIMAL_SKEPTIC_REPORT,
      verifierReport: MINIMAL_VERIFIER_REPORT,
      traces: [TRACE_WITH_PRIVATE_CONTENT],
      force: false,
    });

    expect(result.tracesPath).not.toBeNull();
    const traces = JSON.parse(await readFile(result.tracesPath!, "utf8")) as Array<LLMTrace>;
    expect(traces[0]!.request.messages[1]!.content).toMatch(/^\[content omitted: \d+ chars\]$/);
    expect(traces[0]!.response.rawText).toBeUndefined();
  });
});
