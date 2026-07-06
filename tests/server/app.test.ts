import { mkdtemp, mkdir, rm, writeFile, readFile, stat } from "node:fs/promises";
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
      group: null,
      archived: false,
      archivedAt: null,
      updatedAt: "",
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
      group: null,
      archived: false,
      archivedAt: null,
      updatedAt: "",
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
      group: null,
      archived: false,
      archivedAt: null,
      updatedAt: "",
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

describe("skill management: group / archive / delete", () => {
  let tempRoot: string;
  let runsDir: string;
  const testToken = "test-api-token-management";

  beforeAll(async () => {
    process.env["SESSION2SKILLS_API_TOKEN"] = testToken;
    tempRoot = await mkdtemp(join(tmpdir(), "s2k-mgmt-"));
    runsDir = join(tempRoot, "runs");
    await mkdir(runsDir, { recursive: true });
  });

  afterAll(async () => {
    delete process.env["SESSION2SKILLS_API_TOKEN"];
    await rm(tempRoot, { recursive: true, force: true });
  });

  async function seedRun(name: string, base: string = runsDir): Promise<string> {
    const runDir = join(base, name);
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "claim-manifest.json"), JSON.stringify(validManifest()));
    await writeFile(
      join(runDir, "SKILL.md"),
      `---\nname: ${name}\ndescription: Test generated skill.\n---\n\n# ${name}\n`,
    );
    return runDir;
  }

  async function readMetaFile(name: string): Promise<Record<string, unknown>> {
    const raw = await readFile(join(runsDir, name, ".skill-meta.json"), "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  }

  async function writeMetaFile(name: string, meta: Record<string, unknown>): Promise<void> {
    await writeFile(join(runsDir, name, ".skill-meta.json"), JSON.stringify(meta));
  }

  function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${testToken}`, ...extra };
  }

  describe("scanRuns metadata + archive filtering", () => {
    test("excludes archived runs by default and includes them with includeArchived", async () => {
      const caseDir = join(tempRoot, "case-filter");
      await mkdir(caseDir, { recursive: true });
      await seedRun("scan-active", caseDir);
      await seedRun("scan-archived", caseDir);
      await writeFile(
        join(caseDir, "scan-archived", ".skill-meta.json"),
        JSON.stringify({
          schemaVersion: "skill-run-meta/v1",
          group: null,
          archived: true,
          archivedAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z",
        }),
      );

      const visible = await scanRuns(caseDir);
      expect(visible.map((r) => r.name)).toEqual(["scan-active"]);

      const all = await scanRuns(caseDir, { includeArchived: true });
      expect(all.map((r) => r.name).sort()).toEqual(["scan-active", "scan-archived"]);
      const archived = all.find((r) => r.name === "scan-archived")!;
      expect(archived.archived).toBe(true);
      expect(archived.archivedAt).toBe("2026-03-01T00:00:00.000Z");
    });

    test("emits group from .skill-meta.json", async () => {
      const caseDir = join(tempRoot, "case-group");
      await mkdir(caseDir, { recursive: true });
      await seedRun("scan-grouped", caseDir);
      await writeFile(
        join(caseDir, "scan-grouped", ".skill-meta.json"),
        JSON.stringify({
          schemaVersion: "skill-run-meta/v1",
          group: "Payments",
          archived: false,
          archivedAt: null,
          updatedAt: "2026-03-02T00:00:00.000Z",
        }),
      );

      const [run] = await scanRuns(caseDir);
      expect(run.name).toBe("scan-grouped");
      expect(run.group).toBe("Payments");
      expect(run.archived).toBe(false);
      expect(run.updatedAt).toBe("2026-03-02T00:00:00.000Z");
    });

    test("treats malformed .skill-meta.json as unarchived with group null", async () => {
      const caseDir = join(tempRoot, "case-malformed");
      await mkdir(caseDir, { recursive: true });
      await seedRun("scan-malformed", caseDir);
      await writeFile(join(caseDir, "scan-malformed", ".skill-meta.json"), "{ not valid json");

      const [run] = await scanRuns(caseDir);
      expect(run.name).toBe("scan-malformed");
      expect(run.group).toBeNull();
      expect(run.archived).toBe(false);
      expect(run.archivedAt).toBeNull();
    });
  });

  describe("PATCH /api/runs/:name/meta", () => {
    test("sets a trimmed group and returns the updated summary", async () => {
      await seedRun("patch-group");
      const app = createServer(runsDir, { projectDirectory: tempRoot });

      const res = await app.request("/api/runs/patch-group/meta", {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ group: "  Payments Team  " }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body["group"]).toBe("Payments Team");
      expect(body["archived"]).toBe(false);

      const meta = await readMetaFile("patch-group");
      expect(meta["schemaVersion"]).toBe("skill-run-meta/v1");
      expect(meta["group"]).toBe("Payments Team");
      expect(typeof meta["updatedAt"]).toBe("string");
      expect(meta["updatedAt"]).not.toBe("");
    });

    test("normalizes empty/whitespace group to null", async () => {
      await seedRun("patch-empty-group");
      await writeMetaFile("patch-empty-group", {
        schemaVersion: "skill-run-meta/v1",
        group: "Existing",
        archived: false,
        archivedAt: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      const app = createServer(runsDir, { projectDirectory: tempRoot });

      const res = await app.request("/api/runs/patch-empty-group/meta", {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ group: "   " }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body["group"]).toBeNull();
    });

    test("explicit group: null clears an existing group", async () => {
      await seedRun("patch-clear-group");
      await writeMetaFile("patch-clear-group", {
        schemaVersion: "skill-run-meta/v1",
        group: "Before",
        archived: false,
        archivedAt: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      const app = createServer(runsDir, { projectDirectory: tempRoot });

      const res = await app.request("/api/runs/patch-clear-group/meta", {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ group: null }),
      });

      expect(res.status).toBe(200);
      expect(((await res.json()) as Record<string, unknown>)["group"]).toBeNull();
    });

    test("archiving stamps archivedAt and updatedAt", async () => {
      await seedRun("patch-archive");
      const app = createServer(runsDir, { projectDirectory: tempRoot });

      const res = await app.request("/api/runs/patch-archive/meta", {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ archived: true }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body["archived"]).toBe(true);
      expect(typeof body["archivedAt"]).toBe("string");
      expect((body["archivedAt"] as string).length).toBeGreaterThan(0);

      const meta = await readMetaFile("patch-archive");
      expect(meta["archived"]).toBe(true);
      expect(meta["archivedAt"]).toBe(body["archivedAt"]);
    });

    test("unarchiving clears archivedAt", async () => {
      await seedRun("patch-unarchive");
      await writeMetaFile("patch-unarchive", {
        schemaVersion: "skill-run-meta/v1",
        group: null,
        archived: true,
        archivedAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      });
      const app = createServer(runsDir, { projectDirectory: tempRoot });

      const res = await app.request("/api/runs/patch-unarchive/meta", {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ archived: false }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body["archived"]).toBe(false);
      expect(body["archivedAt"]).toBeNull();
    });

    test("is visible in GET /api/runs only with includeArchived=true", async () => {
      await seedRun("patch-visibility");
      const app = createServer(runsDir, { projectDirectory: tempRoot });

      const patchRes = await app.request("/api/runs/patch-visibility/meta", {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ archived: true }),
      });
      expect(patchRes.status).toBe(200);

      const defaultRes = await app.request("/api/runs");
      const defaultBody = (await defaultRes.json()) as Array<{ name: string }>;
      expect(defaultBody.map((r) => r.name)).not.toContain("patch-visibility");

      const allRes = await app.request("/api/runs?includeArchived=true");
      const allBody = (await allRes.json()) as Array<{ name: string }>;
      expect(allBody.map((r) => r.name)).toContain("patch-visibility");
    });
  });

  describe("PATCH /api/runs/:name/meta validation", () => {
    test("rejects non-string group (number) with 400", async () => {
      await seedRun("patch-bad-group-num");
      const app = createServer(runsDir, { projectDirectory: tempRoot });

      const res = await app.request("/api/runs/patch-bad-group-num/meta", {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ group: 42 }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "group must be a string or null" });
    });

    test("rejects array group with 400", async () => {
      await seedRun("patch-bad-group-arr");
      const app = createServer(runsDir, { projectDirectory: tempRoot });

      const res = await app.request("/api/runs/patch-bad-group-arr/meta", {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ group: ["x"] }),
      });

      expect(res.status).toBe(400);
    });

    test("rejects non-boolean archived with 400", async () => {
      await seedRun("patch-bad-archived");
      const app = createServer(runsDir, { projectDirectory: tempRoot });

      const res = await app.request("/api/runs/patch-bad-archived/meta", {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ archived: "true" }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "archived must be a boolean" });
    });

    test("rejects non-object body (array) with 400", async () => {
      await seedRun("patch-bad-body");
      const app = createServer(runsDir, { projectDirectory: tempRoot });

      const res = await app.request("/api/runs/patch-bad-body/meta", {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify([{ group: "x" }]),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Request body must be a JSON object" });
    });

    test("rejects malformed JSON body with 400", async () => {
      await seedRun("patch-bad-json");
      const app = createServer(runsDir, { projectDirectory: tempRoot });

      const res = await app.request("/api/runs/patch-bad-json/meta", {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: "not json",
      });

      expect(res.status).toBe(400);
    });

    test("returns 404 for a missing run", async () => {
      const app = createServer(runsDir, { projectDirectory: tempRoot });

      const res = await app.request("/api/runs/no-such-run/meta", {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ group: "x" }),
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Run not found: no-such-run" });
    });

    test("returns 400 for an invalid run name", async () => {
      const app = createServer(runsDir, { projectDirectory: tempRoot });

      const res = await app.request("/api/runs/..%2Fetc/meta", {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ group: "x" }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid run name" });
    });

    test("returns 401 without a bearer token", async () => {
      await seedRun("patch-auth");
      const app = createServer(runsDir, { projectDirectory: tempRoot });

      const res = await app.request("/api/runs/patch-auth/meta", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ group: "x" }),
      });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });

    test("returns 409 when generation is still running", async () => {
      await seedRun("patch-running");
      await writeFile(
        join(runsDir, "patch-running", ".progress.json"),
        JSON.stringify({
          stage: "analyst",
          completedStages: [],
          startedAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z",
          pid: process.pid,
        }),
      );
      const app = createServer(runsDir, { projectDirectory: tempRoot });

      const res = await app.request("/api/runs/patch-running/meta", {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ archived: true }),
      });

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: `Generation already running (pid ${process.pid})`,
      });
    });
  });

  describe("DELETE /api/runs/:name", () => {
    test("removes the run directory and returns { deleted, name }", async () => {
      await seedRun("delete-me");
      const app = createServer(runsDir, { projectDirectory: tempRoot });

      const res = await app.request("/api/runs/delete-me", {
        method: "DELETE",
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ deleted: true, name: "delete-me" });

      const runDirStat = await stat(join(runsDir, "delete-me")).catch(() => null);
      expect(runDirStat).toBeNull();
    });

    test("returns 404 for a missing run", async () => {
      const app = createServer(runsDir, { projectDirectory: tempRoot });

      const res = await app.request("/api/runs/never-existed", {
        method: "DELETE",
        headers: authHeaders(),
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Run not found: never-existed" });
    });

    test("returns 400 for an invalid run name", async () => {
      const app = createServer(runsDir, { projectDirectory: tempRoot });

      const res = await app.request("/api/runs/..%2Fetc%2Fpasswd", {
        method: "DELETE",
        headers: authHeaders(),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid run name" });
    });

    test("returns 401 without a bearer token", async () => {
      await seedRun("delete-auth");
      const app = createServer(runsDir, { projectDirectory: tempRoot });

      const res = await app.request("/api/runs/delete-auth", { method: "DELETE" });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
      // The run must still exist when auth fails.
      const stillThere = await stat(join(runsDir, "delete-auth")).catch(() => null);
      expect(stillThere?.isDirectory()).toBe(true);
    });

    test("returns 409 and leaves the run in place when generation is still running", async () => {
      await seedRun("delete-running");
      await writeFile(
        join(runsDir, "delete-running", ".progress.json"),
        JSON.stringify({
          stage: "writer",
          completedStages: ["analyst", "skeptic"],
          startedAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z",
          pid: process.pid,
        }),
      );
      const app = createServer(runsDir, { projectDirectory: tempRoot });

      const res = await app.request("/api/runs/delete-running", {
        method: "DELETE",
        headers: authHeaders(),
      });

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: `Generation already running (pid ${process.pid})`,
      });
      const stillThere = await stat(join(runsDir, "delete-running")).catch(() => null);
      expect(stillThere?.isDirectory()).toBe(true);
    });
  });
});
