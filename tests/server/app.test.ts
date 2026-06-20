import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createServer, scanRuns, reconcileOrphanedRuns } from "../../src/server/app.js";

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
    await writeFile(join(runsDir, "not-a-run", "notes.txt"), "no generated artifacts");

    const result = await scanRuns(runsDir);
    expect(result).toEqual([]);
  });

  test("summarizes a legacy SKILL-only run", async () => {
    const runsDir = join(tempRoot, "legacy");
    const runDir = join(runsDir, "legacy-run");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "SKILL.md"), "# Legacy Skill\n");

    const [run] = await scanRuns(runsDir);

    expect(run).toEqual({
      name: "legacy-run",
      model: "unknown",
      generatedAt: "",
      verifierPassed: false,
      claimCount: 0,
      skepticScore: 0,
      skepticIssueCount: 0,
      artifactStatus: "legacy",
      skillAvailable: true,
      summaryAvailable: false,
    });
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
      artifactStatus: "partial",
      skillAvailable: false,
      summaryAvailable: false,
    });
  });

  test("summarizes a summary-only run", async () => {
    const runsDir = join(tempRoot, "summary-only");
    const runDir = join(runsDir, "summary-run");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "summary.md"), "# Summary\n");

    const [run] = await scanRuns(runsDir);

    expect(run).toEqual({
      name: "summary-run",
      model: "unknown",
      generatedAt: "",
      verifierPassed: false,
      claimCount: 0,
      skepticScore: 0,
      skepticIssueCount: 0,
      artifactStatus: "partial",
      skillAvailable: false,
      summaryAvailable: true,
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
  const testToken = "test-api-token-12345";

  beforeAll(async () => {
    process.env["SESSION2SKILLS_API_TOKEN"] = testToken;
    tempRoot = await mkdtemp(join(tmpdir(), "s2k-app-test-"));
    runsDir = join(tempRoot, "generated-skills");
    const runDir = join(runsDir, "app-run");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "claim-manifest.json"), JSON.stringify(validManifest()));
    await writeFile(join(runDir, "skeptic-report.json"), JSON.stringify(validSkeptic(1, 0)));
    await writeFile(join(runDir, "verifier-report.json"), JSON.stringify(validVerifier(true)));
    await writeFile(
      join(runDir, "SKILL.md"),
      "---\nname: app-run\ndescription: Test generated skill.\n---\n\n# App Run\n\nUse the verified output.\n",
    );
  });

  afterAll(async () => {
    delete process.env["SESSION2SKILLS_API_TOKEN"];
    await rm(tempRoot, { recursive: true, force: true });
  });

  test("GET /api/health returns ok", async () => {
    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("GET /api/runs returns summarized array", async () => {
    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const res = await app.request("/api/runs");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("app-run");
    expect(body[0].claimCount).toBe(2);
    expect(body[0].verifierPassed).toBe(true);
  });

  test("GET /api/runs returns empty array for missing directory", async () => {
    const app = createServer(join(tempRoot, "no-such-dir"), { projectDirectory: tempRoot });
    const res = await app.request("/api/runs");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("GET /api/runs/:name returns combined run data", async () => {
    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const res = await app.request("/api/runs/app-run");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.name).toBe("app-run");
    expect(body.claimManifest).toEqual(validManifest());
    expect(body.skepticReport).toEqual(validSkeptic(1, 0));
    expect(body.verifierReport).toEqual(validVerifier(true));
    expect(body.writerSections).toBeNull();
    expect(body.skillMarkdown).toContain("Use the verified output.");
    expect(body.traces).toEqual([]);
  });

  test("GET /api/runs/:name returns 404 for missing run", async () => {
    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const res = await app.request("/api/runs/does-not-exist");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Run not found: does-not-exist" });
  });

  test("GET /api/runs/:name handles missing optional artifacts", async () => {
    const partialDir = join(tempRoot, "partial-run-detail");
    const partialRun = join(partialDir, "only-manifest");
    await mkdir(partialRun, { recursive: true });
    await writeFile(join(partialRun, "claim-manifest.json"), JSON.stringify(validManifest()));

    const app = createServer(partialDir, { projectDirectory: tempRoot });
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

  test("GET /api/runs/:name/evidence/:evidenceId returns evidence item", async () => {
    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const manifest = validManifest({
      evidence: [
        { evidenceID: "ev-1", sourceType: "message", excerpt: "hello" },
        { evidenceID: "ev-2", sourceType: "tool", excerpt: "world" },
      ],
    });
    await writeFile(join(runsDir, "app-run", "claim-manifest.json"), JSON.stringify(manifest));

    const res = await app.request("/api/runs/app-run/evidence/ev-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ evidenceID: "ev-1", sourceType: "message", excerpt: "hello" });
  });

  test("GET /api/runs/:name/evidence/:evidenceId returns 404 for missing evidence", async () => {
    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const res = await app.request("/api/runs/app-run/evidence/missing");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Evidence not found" });
  });

  test("GET /api/runs/:name/evidence/:evidenceId handles missing evidence array", async () => {
    const app = createServer(runsDir, { projectDirectory: tempRoot });
    await writeFile(join(runsDir, "app-run", "claim-manifest.json"), JSON.stringify(validManifest()));
    const res = await app.request("/api/runs/app-run/evidence/ev-1");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Evidence array not found" });
  });

  test("POST /api/runs/:name/evaluate returns deterministic evaluation", async () => {
    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const res = await app.request("/api/runs/app-run/evaluate", {
      method: "POST",
      headers: { Authorization: `Bearer ${testToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["evaluation"]).toEqual(
      expect.objectContaining({
        schemaVersion: "skill-evaluation/v1",
        skillID: "app-run",
        verdict: expect.any(String),
      }),
    );
    expect(body["skillMarkdown"]).toContain("Use the verified output.");
    expect(body["verifierReport"]).toEqual(validVerifier(true));
  });

  test("POST /api/runs validates request and returns generated run summary", async () => {
    const generatedRoot = join(tempRoot, "generated-skills");
    const calls: Array<Record<string, unknown>> = [];
    const app = createServer(generatedRoot, {
      projectDirectory: tempRoot,
      generateRun: async (input) => {
        calls.push(input);
        await mkdir(input.outputDirectory, { recursive: true });
        await writeFile(join(input.outputDirectory, "claim-manifest.json"), JSON.stringify(validManifest()));
        await writeFile(join(input.outputDirectory, "summary.md"), "# Summary\n");
        await writeFile(join(input.outputDirectory, "SKILL.md"), "# Generated Skill\n");
      },
    });

    const res = await app.request("/api/runs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${testToken}`,
      },
      body: JSON.stringify({
        name: "My Skill!",
        recent: 3,
        workspace: "workspace-1",
        tone: "concise",
        force: true,
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual(
      expect.objectContaining({
        name: "my-skill",
        artifactStatus: "complete",
        skillAvailable: true,
        summaryAvailable: true,
        claimCount: 2,
      }),
    );
    expect(calls).toEqual([
      {
        projectDirectory: tempRoot,
        outputDirectory: join(generatedRoot, "my-skill"),
        recent: 3,
        workspace: "workspace-1",
        tone: "concise",
        force: true,
      },
    ]);
  });

  test("POST /api/runs rejects invalid request values", async () => {
    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const res = await app.request("/api/runs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${testToken}`,
      },
      body: JSON.stringify({ recent: 0, tone: "loud" }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "recent must be a positive integer",
    });
  });

  test("POST /api/runs returns 401 without Authorization header", async () => {
    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const res = await app.request("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "test-skill" }),
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  test("POST /api/runs/:name/evaluate returns 401 without Authorization header", async () => {
    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const res = await app.request("/api/runs/app-run/evaluate", {
      method: "POST",
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  test("GET /api/runs rejects requests from non-localhost origins", async () => {
    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const res = await app.request("/api/runs", {
      headers: { Origin: "http://evil.com" },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Origin not allowed" });
  });

  test("GET /api/runs allows requests from localhost origin", async () => {
    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const res = await app.request("/api/runs", {
      headers: { Origin: "http://localhost:3000" },
    });

    expect(res.status).toBe(200);
  });

  test("GET /api/runs/:name rejects path traversal attempts", async () => {
    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const res = await app.request("/api/runs/..%2F..%2Fetc%2Fpasswd");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid run name" });
  });

  test("GET /api/runs/:name rejects names with .. segments", async () => {
    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const res = await app.request("/api/runs/foo%2F..%2Fbar");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid run name" });
  });
});

describe("scanRuns progress state (issue #73)", () => {
  let tempRoot: string;

  beforeAll(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "s2k-progress-scan-"));
  });

  afterAll(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  test("exposes progressStage when .progress.json is in a non-terminal stage", async () => {
    const runsDir = join(tempRoot, "non-terminal");
    const runDir = join(runsDir, "stuck-run");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "claim-manifest.json"), JSON.stringify(validManifest()));
    await writeFile(
      join(runDir, ".progress.json"),
      JSON.stringify({
        stage: "analyst",
        completedStages: [],
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:01.000Z",
      }),
    );

    const [run] = await scanRuns(runsDir);
    expect(run.progressStage).toBe("analyst");
  });

  test("does not expose progressStage when stage is done", async () => {
    const runsDir = join(tempRoot, "done");
    const runDir = join(runsDir, "completed-run");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "claim-manifest.json"), JSON.stringify(validManifest()));
    await writeFile(join(runDir, "SKILL.md"), "# done\n");
    await writeFile(
      join(runDir, ".progress.json"),
      JSON.stringify({
        stage: "done",
        completedStages: ["analyst", "skeptic", "writer", "verifier"],
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:05.000Z",
      }),
    );

    const [run] = await scanRuns(runsDir);
    expect(run.progressStage).toBeUndefined();
  });

  test("exposes progressStage 'interrupted' for orphaned runs", async () => {
    const runsDir = join(tempRoot, "interrupted");
    const runDir = join(runsDir, "interrupted-run");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "claim-manifest.json"), JSON.stringify(validManifest()));
    await writeFile(
      join(runDir, ".progress.json"),
      JSON.stringify({
        stage: "interrupted",
        completedStages: ["analyst"],
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:02.000Z",
        error: "Server restarted mid-generation",
      }),
    );

    const [run] = await scanRuns(runsDir);
    expect(run.progressStage).toBe("interrupted");
  });
});

describe("createServer startup reconciliation (issue #73)", () => {
  let tempRoot: string;
  let runsDir: string;

  beforeAll(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "s2k-reconcile-"));
    runsDir = join(tempRoot, "runs");
  });

  afterAll(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  test("marks orphaned non-terminal run as interrupted when SKILL.md is missing", async () => {
    const runDir = join(runsDir, "orphaned-no-skill");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "claim-manifest.json"), JSON.stringify(validManifest()));
    await writeFile(
      join(runDir, ".progress.json"),
      JSON.stringify({
        stage: "skeptic",
        completedStages: ["analyst"],
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:02.000Z",
      }),
    );

    await reconcileOrphanedRuns(runsDir);

    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const progressRes = await app.request("/api/runs/orphaned-no-skill/progress");
    const progress = await progressRes.json();
    expect(progress.stage).toBe("interrupted");
    expect(progress.error).toEqual(expect.any(String));
    expect(progress.completedStages).toEqual(["analyst"]);
  });

  test("marks orphaned non-terminal run as done when SKILL.md exists", async () => {
    const runDir = join(runsDir, "orphaned-with-skill");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "claim-manifest.json"), JSON.stringify(validManifest()));
    await writeFile(join(runDir, "SKILL.md"), "# Recovered\n");
    await writeFile(
      join(runDir, ".progress.json"),
      JSON.stringify({
        stage: "writer",
        completedStages: ["analyst", "skeptic"],
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:03.000Z",
      }),
    );

    await reconcileOrphanedRuns(runsDir);

    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const progressRes = await app.request("/api/runs/orphaned-with-skill/progress");
    const progress = await progressRes.json();
    expect(progress.stage).toBe("done");
  });

  test("leaves terminal runs untouched", async () => {
    const runDir = join(runsDir, "already-error");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "claim-manifest.json"), JSON.stringify(validManifest()));
    await writeFile(
      join(runDir, ".progress.json"),
      JSON.stringify({
        stage: "error",
        completedStages: ["analyst"],
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:02.000Z",
        error: "pre-existing failure",
      }),
    );

    await reconcileOrphanedRuns(runsDir);

    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const progressRes = await app.request("/api/runs/already-error/progress");
    const progress = await progressRes.json();
    expect(progress.stage).toBe("error");
    expect(progress.error).toBe("pre-existing failure");
  });
});
