import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createServer, scanRuns } from "../../src/server/app.js";

function validManifest(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    schemaVersion: "claim-manifest/v1",
    claims: [{ id: "c1" }, { id: "c2" }],
    evidenceSummary: "",
    dimensionsCovered: [],
    metadata: { generatedAt: "2026-01-01T00:00:00.000Z", sessionCount: 1, totalEvidenceItems: 2 },
    ...overrides,
  };
}

function validSkeptic(score: number, issueCount: number): Record<string, unknown> {
  const issues = Array.from({ length: issueCount }, (_, i) => ({ claimId: `c${i + 1}` }));
  return {
    schemaVersion: "skeptic-report/v1",
    issues,
    overallScore: score,
    metadata: { generatedAt: "2026-01-01T00:00:00.000Z", claimCount: 2, issueCount },
  };
}

function validVerifier(passed: boolean): Record<string, unknown> {
  return {
    schemaVersion: "verifier-report/v1",
    pass: passed,
    checkedItems: [],
    issues: [],
    metadata: { generatedAt: "2026-01-01T00:00:00.000Z", directiveCount: 0, verifiedCount: 0, fabricatedCount: 0 },
  };
}

function tracesFor(model: string): unknown {
  return [
    { schemaVersion: "llm-trace/v1", traceID: "t1", model, stage: "harness-analyst", provider: "p", request: { promptName: "x", messages: [] }, response: { finishReason: "stop" } },
  ];
}

describe("scanRuns", () => {
  let tempRoot: string;

  beforeAll(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "s2k-server-test-"));
  });

  afterAll(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  test("returns empty array when directory does not exist", async () => {
    const result = await scanRuns(join(tempRoot, "does-not-exist"));
    expect(result).toEqual([]);
  });

  test("returns empty array for directory with no harness runs", async () => {
    const runsDir = join(tempRoot, "empty");
    await mkdir(join(runsDir, "not-a-run"), { recursive: true });
    await writeFile(join(runsDir, "not-a-run", "SKILL.md"), "# no manifest");

    const result = await scanRuns(runsDir);
    expect(result).toEqual([]);
  });

  test("summarizes a complete harness run", async () => {
    const runsDir = join(tempRoot, "complete");
    const runDir = join(runsDir, "my-run");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "claim-manifest.json"), JSON.stringify(validManifest()));
    await writeFile(join(runDir, "skeptic-report.json"), JSON.stringify(validSkeptic(0.85, 1)));
    await writeFile(join(runDir, "verifier-report.json"), JSON.stringify(validVerifier(true)));
    await writeFile(join(runDir, "llm-traces.json"), JSON.stringify(tracesFor("glm-4.7")));

    const [run] = await scanRuns(runsDir);

    expect(run).toEqual({
      name: "my-run",
      model: "glm-4.7",
      generatedAt: "2026-01-01T00:00:00.000Z",
      verifierPassed: true,
      claimCount: 2,
      skepticScore: 0.85,
      skepticIssueCount: 1,
    });
  });

  test("applies defaults for missing optional artifacts", async () => {
    const runsDir = join(tempRoot, "partial");
    const runDir = join(runsDir, "partial-run");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "claim-manifest.json"), JSON.stringify(validManifest()));

    const [run] = await scanRuns(runsDir);

    expect(run.model).toBe("unknown");
    expect(run.verifierPassed).toBe(false);
    expect(run.skepticScore).toBe(0);
    expect(run.skepticIssueCount).toBe(0);
  });

  test("sorts runs by generatedAt descending", async () => {
    const runsDir = join(tempRoot, "sorted");
    await mkdir(runsDir, { recursive: true });

    for (const [name, ts] of [["older", "2026-01-01T00:00:00.000Z"], ["newer", "2026-06-01T00:00:00.000Z"]] as const) {
      const runDir = join(runsDir, name);
      await mkdir(runDir, { recursive: true });
      await writeFile(join(runDir, "claim-manifest.json"), JSON.stringify(validManifest({ metadata: { generatedAt: ts, sessionCount: 1, totalEvidenceItems: 1 } })));
    }

    const result = await scanRuns(runsDir);
    expect(result[0]!.name).toBe("newer");
    expect(result[1]!.name).toBe("older");
  });
});

describe("Hono app", () => {
  let tempRoot: string;
  let runsDir: string;

  beforeAll(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "s2k-app-test-"));
    runsDir = join(tempRoot, "generated-skills");
    const runDir = join(runsDir, "app-run");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "claim-manifest.json"), JSON.stringify(validManifest()));
    await writeFile(join(runDir, "skeptic-report.json"), JSON.stringify(validSkeptic(1, 0)));
    await writeFile(join(runDir, "verifier-report.json"), JSON.stringify(validVerifier(true)));
  });

  afterAll(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  test("GET /api/health returns ok", async () => {
    const app = createServer(runsDir);
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("GET /api/runs returns summarized array", async () => {
    const app = createServer(runsDir);
    const res = await app.request("/api/runs");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("app-run");
    expect(body[0].claimCount).toBe(2);
    expect(body[0].verifierPassed).toBe(true);
  });

  test("GET /api/runs returns empty array for missing directory", async () => {
    const app = createServer(join(tempRoot, "no-such-dir"));
    const res = await app.request("/api/runs");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("GET /api/runs/:name returns combined run data", async () => {
    const app = createServer(runsDir);
    const res = await app.request("/api/runs/app-run");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.name).toBe("app-run");
    expect(body.claimManifest).toEqual(validManifest());
    expect(body.skepticReport).toEqual(validSkeptic(1, 0));
    expect(body.verifierReport).toEqual(validVerifier(true));
    expect(body.writerSections).toBeNull();
    expect(body.skillMarkdown).toBeNull();
    expect(body.traces).toEqual([]);
  });

  test("GET /api/runs/:name returns 404 for missing run", async () => {
    const app = createServer(runsDir);
    const res = await app.request("/api/runs/does-not-exist");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Run not found: does-not-exist" });
  });

  test("GET /api/runs/:name handles missing optional artifacts", async () => {
    const partialDir = join(tempRoot, "partial-run-detail");
    const partialRun = join(partialDir, "only-manifest");
    await mkdir(partialRun, { recursive: true });
    await writeFile(join(partialRun, "claim-manifest.json"), JSON.stringify(validManifest()));

    const app = createServer(partialDir);
    const res = await app.request("/api/runs/only-manifest");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.claimManifest).toEqual(validManifest());
    expect(body.skepticReport).toBeNull();
    expect(body.verifierReport).toBeNull();
    expect(body.writerSections).toBeNull();
    expect(body.skillMarkdown).toBeNull();
    expect(body.traces).toEqual([]);
  });
});
