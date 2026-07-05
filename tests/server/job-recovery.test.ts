import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  createServer,
  reconcileOrphanedRuns,
  isPidAlive,
} from "../../src/server/app.js";
import type { GenerateSkillRunInput } from "../../src/generate/service.js";
import {
  hashArtifact,
  resumeFromStage,
  markProgressResumable,
  markProgressInterrupted,
  readProgress,
  STAGE_ARTIFACT_FILE,
  type ProgressFile,
} from "../../src/generate/progress.js";
import { parseWorkerInput, type WorkerInput } from "../../src/worker/generate-worker.js";

function validManifest(): Record<string, unknown> {
  return {
    schemaVersion: "claim-manifest/v1",
    claims: [{ id: "c1" }],
    evidenceSummary: "",
    dimensionsCovered: [],
    metadata: { generatedAt: "2026-01-01T00:00:00.000Z", sessionCount: 1, totalEvidenceItems: 1 },
  };
}

async function writeProgressFile(runDir: string, progress: ProgressFile): Promise<void> {
  await writeFile(join(runDir, ".progress.json"), JSON.stringify(progress, null, 2), "utf8");
}

describe("isPidAlive", () => {
  test("reports the current process as alive", () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  test("reports a definitely-dead PID as not alive", () => {
    // PID 2^31-1 is effectively never allocated on a local machine.
    expect(isPidAlive(2147483647)).toBe(false);
  });
});

describe("resumeFromStage", () => {
  test("starts at analyst when nothing completed", () => {
    expect(resumeFromStage([])).toBe("analyst");
  });

  test("advances past completed stages in order", () => {
    expect(resumeFromStage(["analyst"])).toBe("skeptic");
    expect(resumeFromStage(["analyst", "skeptic"])).toBe("writer");
    expect(resumeFromStage(["analyst", "skeptic", "writer"])).toBe("verifier");
  });

  test("returns null when every stage is complete", () => {
    expect(resumeFromStage(["analyst", "skeptic", "writer", "verifier"])).toBeNull();
  });
});

describe("parseWorkerInput", () => {
  test("parses required + optional fields with defaults", () => {
    const input = parseWorkerInput(
      JSON.stringify({
        projectDirectory: "/tmp/proj",
        outputDirectory: "/tmp/out",
        workspace: "ws",
        tone: "concise",
        force: true,
        recent: 7,
        template: "standard",
        skillType: "coding",
        evidenceConfig: { tokenBudget: 1000 },
        sessionSelections: [{ adapter: "claude", sessionId: "s1" }],
      }),
    );
    expect(input).toMatchObject({
      projectDirectory: "/tmp/proj",
      outputDirectory: "/tmp/out",
      workspace: "ws",
      tone: "concise",
      force: true,
      recent: 7,
      template: "standard",
      skillType: "coding",
    });
    expect(input.sessionSelections).toEqual([{ adapter: "claude", sessionId: "s1" }]);
  });

  test("applies defaults for recent and tone when omitted", () => {
    const input = parseWorkerInput(
      JSON.stringify({ projectDirectory: "/p", outputDirectory: "/o" }),
    );
    expect(input.recent).toBe(10);
    expect(input.tone).toBe("balanced");
    expect(input.force).toBe(false);
  });

  test("rejects non-object input", () => {
    expect(() => parseWorkerInput(JSON.stringify([1, 2, 3]))).toThrow(/JSON object/);
  });

  test("rejects invalid JSON", () => {
    expect(() => parseWorkerInput("{not json")).toThrow(/invalid JSON/);
  });

  test("rejects missing required directories", () => {
    expect(() => parseWorkerInput(JSON.stringify({ recent: 5 }))).toThrow(/required strings/);
  });

  test("parses llmConfig when present", () => {
    const input = parseWorkerInput(
      JSON.stringify({
        projectDirectory: "/p",
        outputDirectory: "/o",
        llmConfig: {
          provider: "openai",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-4o",
          apiKey: "secret",
        },
      }),
    );
    expect(input.llmConfig).toEqual({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
      apiKey: "secret",
    });
  });

  test("omits llmConfig when absent", () => {
    const input = parseWorkerInput(
      JSON.stringify({ projectDirectory: "/p", outputDirectory: "/o" }),
    );
    expect(input.llmConfig).toBeUndefined();
  });
});

describe("reconcileOrphanedRuns PID + checkpoint behavior (issue #75)", () => {
  let tempRoot: string;
  let runsDir: string;

  beforeAll(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "s2k-recover-"));
    runsDir = join(tempRoot, "runs");
  });

  afterAll(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  test("skips reconciliation when a live worker PID is recorded", async () => {
    const runDir = join(runsDir, "live-worker");
    await mkdir(runDir, { recursive: true });
    await writeProgressFile(runDir, {
      stage: "skeptic",
      completedStages: ["analyst"],
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:02.000Z",
      pid: process.pid, // alive
    });

    await reconcileOrphanedRuns(runsDir);

    const progress = await readProgress(runDir);
    expect(progress?.stage).toBe("skeptic"); // untouched
  });

  test("marks as resumable when checkpoints are intact and SKILL.md missing", async () => {
    const runDir = join(runsDir, "resumable-run");
    await mkdir(runDir, { recursive: true });
    const manifestJson = JSON.stringify(validManifest());
    await writeFile(join(runDir, "claim-manifest.json"), manifestJson);
    const checkpoint = hashArtifact(manifestJson);
    await writeProgressFile(runDir, {
      stage: "skeptic",
      completedStages: ["analyst"],
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:02.000Z",
      pid: 2147483647, // dead
      completedStageCheckpoints: { analyst: checkpoint },
    });

    await reconcileOrphanedRuns(runsDir);

    const progress = await readProgress(runDir);
    expect(progress?.stage).toBe("resumable");
  });

  test("marks as interrupted when a checkpoint no longer matches the artifact", async () => {
    const runDir = join(runsDir, "corrupt-run");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "claim-manifest.json"), JSON.stringify(validManifest()));
    await writeProgressFile(runDir, {
      stage: "skeptic",
      completedStages: ["analyst"],
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:02.000Z",
      pid: 2147483647,
      completedStageCheckpoints: { analyst: "0".repeat(64) }, // wrong hash
    });

    await reconcileOrphanedRuns(runsDir);

    const progress = await readProgress(runDir);
    expect(progress?.stage).toBe("interrupted");
  });

  test("marks as interrupted when checkpoint references a missing artifact", async () => {
    const runDir = join(runsDir, "missing-artifact-run");
    await mkdir(runDir, { recursive: true });
    // No claim-manifest.json on disk
    await writeProgressFile(runDir, {
      stage: "skeptic",
      completedStages: ["analyst"],
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:02.000Z",
      pid: 2147483647,
      completedStageCheckpoints: { analyst: "a".repeat(64) },
    });

    await reconcileOrphanedRuns(runsDir);

    const progress = await readProgress(runDir);
    expect(progress?.stage).toBe("interrupted");
  });
});

describe("POST /api/runs?async=true forks a worker and records PID", () => {
  let tempRoot: string;
  let runsDir: string;

  beforeAll(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "s2k-async-fork-"));
    runsDir = join(tempRoot, "runs");
  });

  afterAll(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  test("spawns the worker via the injected seam and writes pid into progress", async () => {
    const spawned: WorkerInput[] = [];
    const fakePid = 4242;
    const app = createServer(runsDir, {
      projectDirectory: tempRoot,
      spawnGenerateWorker: ({ workerInput }) => {
        spawned.push(workerInput);
        return fakePid;
      },
    });

    const res = await app.request("/api/runs?async=true", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "async-run", recent: 5, tone: "concise" }),
    });

    expect(res.status).toBe(202);
    const body = (await res.json()) as { name: string; status: string; pid: number };
    expect(body).toMatchObject({ name: "async-run", status: "running", pid: fakePid });

    expect(spawned).toHaveLength(1);
    expect(spawned[0]!.outputDirectory).toBe(join(runsDir, "async-run"));
    expect(spawned[0]!.recent).toBe(5);
    expect(spawned[0]!.tone).toBe("concise");

    const progress = await readProgress(join(runsDir, "async-run"));
    expect(progress?.stage).toBe("analyst");
    expect(progress?.pid).toBe(fakePid);
  });
});

describe("POST /api/runs/:name/resume (issue #75)", () => {
  let tempRoot: string;
  let runsDir: string;

  beforeAll(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "s2k-resume-"));
    runsDir = join(tempRoot, "runs");
  });

  afterAll(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  test("re-spawns a worker from a resumable run and records a new pid", async () => {
    const runDir = join(runsDir, "resume-ok");
    await mkdir(runDir, { recursive: true });
    const manifestJson = JSON.stringify(validManifest());
    await writeFile(join(runDir, "claim-manifest.json"), manifestJson);
    await writeProgressFile(
      runDir,
      markProgressResumable(
        {
          stage: "interrupted",
          completedStages: ["analyst"],
          startedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:02.000Z",
          completedStageCheckpoints: { analyst: hashArtifact(manifestJson) },
        },
        "interrupted earlier",
      ),
    );

    const spawned: WorkerInput[] = [];
    const newPid = 9999;
    const app = createServer(runsDir, {
      projectDirectory: tempRoot,
      spawnGenerateWorker: ({ workerInput }) => {
        spawned.push(workerInput);
        return newPid;
      },
    });

    const res = await app.request("/api/runs/resume-ok/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recent: 3 }),
    });

    expect(res.status).toBe(202);
    const body = (await res.json()) as { status: string; pid: number; resumeFrom: string };
    expect(body).toMatchObject({ status: "running", pid: newPid, resumeFrom: "skeptic" });
    expect(spawned).toHaveLength(1);
    expect(spawned[0]!.outputDirectory).toBe(runDir);

    const progress = await readProgress(runDir);
    expect(progress?.pid).toBe(newPid);
    expect(progress?.stage).toBe("skeptic");
  });

  test("refuses to resume while a live worker holds the run", async () => {
    const runDir = join(runsDir, "resume-busy");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "claim-manifest.json"), JSON.stringify(validManifest()));
    await writeProgressFile(runDir, {
      stage: "skeptic",
      completedStages: ["analyst"],
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:02.000Z",
      pid: process.pid, // alive
    });

    const app = createServer(runsDir, {
      projectDirectory: tempRoot,
      spawnGenerateWorker: () => 1234,
    });

    const res = await app.request("/api/runs/resume-busy/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    expect(res.status).toBe(409);
  });

  test("refuses to resume a corrupted-checkpoint run", async () => {
    const runDir = join(runsDir, "resume-corrupt");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "claim-manifest.json"), JSON.stringify(validManifest()));
    await writeProgressFile(runDir, {
      stage: "skeptic",
      completedStages: ["analyst"],
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:02.000Z",
      completedStageCheckpoints: { analyst: "b".repeat(64) }, // mismatch
    });

    const app = createServer(runsDir, {
      projectDirectory: tempRoot,
      spawnGenerateWorker: () => 1234,
    });

    const res = await app.request("/api/runs/resume-corrupt/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/checkpoint/);
  });

  test("refuses to resume a fully-complete run", async () => {
    const runDir = join(runsDir, "resume-complete");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "SKILL.md"), "# Done\n");
    await writeProgressFile(runDir, {
      stage: "done",
      completedStages: ["analyst", "skeptic", "writer", "verifier"],
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:05.000Z",
    });

    const app = createServer(runsDir, {
      projectDirectory: tempRoot,
      spawnGenerateWorker: () => 1234,
    });

    const res = await app.request("/api/runs/resume-complete/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    expect(res.status).toBe(409);
  });

  test("returns 404 for an unknown run", async () => {
    const app = createServer(runsDir, {
      projectDirectory: tempRoot,
      spawnGenerateWorker: () => 1234,
    });
    const res = await app.request("/api/runs/does-not-exist/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });
});

describe("progress schema backwards compatibility", () => {
  test("reads a legacy progress file without pid/checkpoints", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "s2k-legacy-"));
    try {
      await writeFile(
        join(runDir, ".progress.json"),
        JSON.stringify({
          stage: "writer",
          completedStages: ["analyst", "skeptic"],
          startedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:03.000Z",
        }),
        "utf8",
      );
      const progress = await readProgress(runDir);
      expect(progress?.stage).toBe("writer");
      expect(progress?.pid).toBeUndefined();
      expect(progress?.completedStageCheckpoints).toBeUndefined();
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  test("STAGE_ARTIFACT_FILE maps every harness stage to an artifact", async () => {
    const raw = await readFile(
      join(process.cwd(), "src", "generate", "progress.ts"),
      "utf8",
    );
    // sanity: the constant is declared (guards against accidental rename)
    expect(raw).toContain("STAGE_ARTIFACT_FILE");
    expect(STAGE_ARTIFACT_FILE.analyst).toBe("claim-manifest.json");
    expect(STAGE_ARTIFACT_FILE.verifier).toBe("verifier-report.json");
  });
});

// markProgressResumable / markProgressInterrupted exercised indirectly above;
// this just locks the stage values.
describe("progress terminal-stage helpers", () => {
  test("markProgressResumable sets the resumable stage", () => {
    const updated = markProgressResumable(
      {
        stage: "skeptic",
        completedStages: ["analyst"],
        startedAt: "t",
        updatedAt: "t",
      },
      "reason",
    );
    expect(updated.stage).toBe("resumable");
    expect(updated.error).toBe("reason");
  });

  test("markProgressInterrupted sets the interrupted stage", () => {
    const updated = markProgressInterrupted(
      { stage: "skeptic", completedStages: [], startedAt: "t", updatedAt: "t" },
      "boom",
    );
    expect(updated.stage).toBe("interrupted");
  });
});

describe("llmConfig forwarding", () => {
  let tempRoot: string;
  let runsDir: string;

  beforeAll(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "s2k-llmcfg-"));
    runsDir = join(tempRoot, "runs");
  });

  afterAll(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  test("POST /api/runs?async=true forwards llmConfig to the worker input", async () => {
    const spawned: WorkerInput[] = [];
    const app = createServer(runsDir, {
      projectDirectory: tempRoot,
      spawnGenerateWorker: ({ workerInput }) => {
        spawned.push(workerInput);
        return 5555;
      },
    });

    const res = await app.request("/api/runs?async=true", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "async-llm",
        llmConfig: {
          provider: "openai",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-4o",
          apiKey: "secret",
        },
      }),
    });

    expect(res.status).toBe(202);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]!.llmConfig).toEqual({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
      apiKey: "secret",
    });

    // The API key must never be written to the persisted progress file.
    const progressRaw = await readFile(
      join(runsDir, "async-llm", ".progress.json"),
      "utf8",
    );
    expect(progressRaw).not.toContain("secret");
    expect(progressRaw).not.toContain("apiKey");
  });

  test("POST /api/runs (sync) forwards llmConfig to the generator", async () => {
    const captured: GenerateSkillRunInput[] = [];
    const app = createServer(runsDir, {
      projectDirectory: tempRoot,
      generateRun: async (input) => {
        captured.push(input);
        // Materialize a minimal run so scanRuns() can resolve it to a 201.
        await mkdir(input.outputDirectory, { recursive: true });
        await writeFile(join(input.outputDirectory, "SKILL.md"), "# skill\n");
        await writeFile(
          join(input.outputDirectory, "claim-manifest.json"),
          JSON.stringify(validManifest()),
        );
        return {};
      },
    });

    const res = await app.request("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "sync-llm",
        llmConfig: { provider: "deepseek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
      }),
    });

    expect(res.status).toBe(201);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.llmConfig).toEqual({
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
    });
  });

  test("POST /api/runs omits llmConfig from the worker input when not supplied", async () => {
    const spawned: WorkerInput[] = [];
    const app = createServer(runsDir, {
      projectDirectory: tempRoot,
      spawnGenerateWorker: ({ workerInput }) => {
        spawned.push(workerInput);
        return 5556;
      },
    });

    const res = await app.request("/api/runs?async=true", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "async-no-llm" }),
    });

    expect(res.status).toBe(202);
    expect(spawned[0]!.llmConfig).toBeUndefined();
  });

  test("POST /api/runs/:name/resume forwards llmConfig to the re-spawned worker", async () => {
    const runDir = join(runsDir, "resume-llm");
    await mkdir(runDir, { recursive: true });
    const manifestJson = JSON.stringify(validManifest());
    await writeFile(join(runDir, "claim-manifest.json"), manifestJson);
    await writeProgressFile(
      runDir,
      markProgressResumable(
        {
          stage: "interrupted",
          completedStages: ["analyst"],
          startedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:02.000Z",
          completedStageCheckpoints: { analyst: hashArtifact(manifestJson) },
        },
        "interrupted earlier",
      ),
    );

    const spawned: WorkerInput[] = [];
    const app = createServer(runsDir, {
      projectDirectory: tempRoot,
      spawnGenerateWorker: ({ workerInput }) => {
        spawned.push(workerInput);
        return 7777;
      },
    });

    const res = await app.request("/api/runs/resume-llm/resume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        llmConfig: { provider: "ollama", baseUrl: "http://localhost:11434/v1", model: "llama3" },
      }),
    });

    expect(res.status).toBe(202);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]!.llmConfig).toEqual({
      provider: "ollama",
      baseUrl: "http://localhost:11434/v1",
      model: "llama3",
    });
  });
});
