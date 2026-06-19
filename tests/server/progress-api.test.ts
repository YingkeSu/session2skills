import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createServer } from "../../src/server/app.js";

describe("GET /api/runs/:name/progress", () => {
  let tempRoot: string;
  let runsDir: string;

  beforeAll(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "s2k-progress-test-"));
    runsDir = join(tempRoot, "generated-skills");
  });

  afterAll(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  test("returns { stage: 'idle' } for a run with no progress file", async () => {
    const runDir = join(runsDir, "no-progress-run");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "claim-manifest.json"), JSON.stringify({ claims: [] }));

    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const res = await app.request("/api/runs/no-progress-run/progress");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ stage: "idle", completedStages: [] });
  });

  test("returns progress when .progress.json exists", async () => {
    const runDir = join(runsDir, "with-progress-run");
    await mkdir(runDir, { recursive: true });
    await writeFile(
      join(runDir, ".progress.json"),
      JSON.stringify({
        stage: "analyst",
        completedStages: [],
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:01.000Z",
      }),
    );

    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const res = await app.request("/api/runs/with-progress-run/progress");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      stage: "analyst",
      completedStages: [],
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
    });
  });

  test("returns progress with multiple completed stages", async () => {
    const runDir = join(runsDir, "multi-stage-run");
    await mkdir(runDir, { recursive: true });
    await writeFile(
      join(runDir, ".progress.json"),
      JSON.stringify({
        stage: "writer",
        completedStages: ["analyst", "skeptic"],
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:03.000Z",
      }),
    );

    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const res = await app.request("/api/runs/multi-stage-run/progress");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stage).toBe("writer");
    expect(body.completedStages).toEqual(["analyst", "skeptic"]);
  });

  test("returns 404 for missing run", async () => {
    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const res = await app.request("/api/runs/does-not-exist/progress");

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Run not found: does-not-exist" });
  });

  test("returns progress with error stage", async () => {
    const runDir = join(runsDir, "error-run");
    await mkdir(runDir, { recursive: true });
    await writeFile(
      join(runDir, ".progress.json"),
      JSON.stringify({
        stage: "error",
        completedStages: ["analyst"],
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:02.000Z",
        error: "analyst failed: timeout",
      }),
    );

    const app = createServer(runsDir, { projectDirectory: tempRoot });
    const res = await app.request("/api/runs/error-run/progress");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stage).toBe("error");
    expect(body.error).toBe("analyst failed: timeout");
  });
});
