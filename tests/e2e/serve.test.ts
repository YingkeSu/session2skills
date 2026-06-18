import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  getSeededBrowserFixtureRun,
  seedBrowserFixtureRun,
} from "./fixture-run.js";
import { pickPort, waitForServer, waitForStdout } from "./serve-helpers.js";

const projectDir = process.cwd();
const seededRun = getSeededBrowserFixtureRun();

describe("serve command (e2e)", () => {
  let tempRoot: string;
  let serverProcess: ChildProcess | null = null;
  let port: number;
  let shouldSkip = false;

  beforeAll(async () => {
    const mainJs = join(projectDir, "dist/cli/main.js");
    if (!existsSync(mainJs)) {
      throw new Error("E2E preflight: dist/cli/main.js not found. Run 'npm run build' first.");
    }
    const webIndex = join(projectDir, "web/dist/index.html");
    if (!existsSync(webIndex)) {
      throw new Error("E2E preflight: web/dist/index.html not found. Run 'npm run build:web' first.");
    }

    tempRoot = await mkdtemp(join(tmpdir(), "s2k-serve-e2e-"));
    port = pickPort();

    await seedBrowserFixtureRun({
      runsRoot: join(tempRoot, "generated-skills"),
      runName: seededRun.runName,
    });

    try {
      serverProcess = spawn(
        "node",
        ["dist/cli/main.js", "serve", "--directory", tempRoot, "--port", String(port)],
        { cwd: projectDir, stdio: ["ignore", "pipe", "pipe"] },
      );
      await waitForStdout(serverProcess, "Server running", 15000);
      await waitForServer(port);
    } catch (err) {
      shouldSkip = true;
      serverProcess?.kill("SIGKILL");
      throw err;
    }
  }, 60000);

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 500));
      serverProcess.kill("SIGKILL");
    }
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("GET /api/health returns ok", async () => {
    if (shouldSkip) return;
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("GET /api/runs returns the seeded run", async () => {
    if (shouldSkip) return;
    const res = await fetch(`http://127.0.0.1:${port}/api/runs`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]!.name).toBe(seededRun.runName);
    expect(body[0]!.model).toBe(seededRun.model);
    expect(body[0]!.generatedAt).toBe(seededRun.generatedAt);
    expect(body[0]!.verifierPassed).toBe(true);
    expect(body[0]!.claimCount).toBe(seededRun.claimCount);
    expect(body[0]!.skepticScore).toBe(seededRun.skepticScore);
    expect(body[0]!.skepticIssueCount).toBe(seededRun.skepticIssueCount);
  });

  test("served APIs expose the data needed for the list-detail-tab-evidence UI flow", async () => {
    if (shouldSkip) return;

    const runsRes = await fetch(`http://127.0.0.1:${port}/api/runs`);
    expect(runsRes.status).toBe(200);
    const runs = (await runsRes.json()) as Array<Record<string, unknown>>;
    expect(runs).toEqual([
      expect.objectContaining({
        name: seededRun.runName,
        model: seededRun.model,
        verifierPassed: true,
        claimCount: seededRun.claimCount,
        skepticScore: seededRun.skepticScore,
        skepticIssueCount: seededRun.skepticIssueCount,
      }),
    ]);

    const detailRes = await fetch(
      `http://127.0.0.1:${port}/api/runs/${seededRun.runName}`,
    );
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as Record<string, unknown>;
    expect(detail["name"]).toBe(seededRun.runName);
    expect(detail["skillMarkdown"]).toContain("Use evidence before generalizing");

    const manifest = detail["claimManifest"] as Record<string, unknown>;
    expect(manifest["evidenceSummary"]).toContain(
      "The session shows a repeated preference",
    );
    expect(manifest["dimensionsCovered"]).toEqual(["planning", "verification"]);
    expect(manifest["evidence"]).toEqual([
      expect.objectContaining({
        evidenceID: "ev-1",
        sourceType: "message",
        excerpt: expect.stringContaining("short preview"),
      }),
      expect.objectContaining({
        evidenceID: "ev-2",
        sourceType: "tool",
        excerpt: expect.stringContaining("Focused e2e command output"),
      }),
    ]);
    expect(manifest["claims"]).toEqual([
      expect.objectContaining({
        id: "c1",
        dimension: "planning",
        label: "Clarify constraints before editing",
        evidenceRefs: ["ev-1"],
      }),
      expect.objectContaining({
        id: "c2",
        dimension: "verification",
        label: "Run focused checks after changes",
        evidenceRefs: ["ev-2"],
      }),
      expect.objectContaining({
        id: "c3",
        dimension: "verification",
        label: "Report commands and results",
        evidenceRefs: [],
      }),
    ]);

    const skepticReport = detail["skepticReport"] as Record<string, unknown>;
    expect(skepticReport["issues"]).toEqual([
      expect.objectContaining({
        claimId: "c1",
        severity: "medium",
        problemType: "thin-evidence",
        detail: expect.stringContaining("Only one direct excerpt"),
      }),
    ]);

    const verifierReport = detail["verifierReport"] as Record<string, unknown>;
    expect(verifierReport["checkedItems"]).toEqual([
      expect.objectContaining({
        directive: "Ask for constraints before touching files.",
        claimId: "c1",
        status: "verified",
      }),
      expect.objectContaining({
        directive: "Run focused tests after each e2e fixture change.",
        claimId: "c2",
        status: "verified",
      }),
      expect.objectContaining({
        directive: "Include command outcomes in the completion report.",
        claimId: "c3",
        status: "verified",
      }),
    ]);

    const writerSections = detail["writerSections"] as Record<string, unknown>;
    expect(writerSections["sections"]).toEqual([
      expect.objectContaining({
        title: "Constraints and anti-patterns",
        groundingClaimIds: ["c1", "c2"],
        directives: [
          expect.objectContaining({
            text: "Use evidence before generalizing.",
            sourceClaimId: "c2",
          }),
        ],
      }),
    ]);

    const traces = detail["traces"] as Array<Record<string, unknown>>;
    expect(traces).toEqual([
      expect.objectContaining({
        stage: "analyst",
        model: "glm-4.7",
        provider: "zhipuai",
        usage: expect.objectContaining({ totalTokens: 42 }),
        latencyMs: 1200,
        finishReason: "stop",
        promptName: "claim-analysis",
      }),
      expect.objectContaining({
        stage: "writer",
        model: "glm-4.7",
        provider: "zhipuai",
        usage: expect.objectContaining({ totalTokens: 75 }),
        latencyMs: 1800,
        finishReason: "stop",
        promptName: "skill-writer",
      }),
    ]);

    const evidenceRes = await fetch(
      `http://127.0.0.1:${port}/api/runs/${seededRun.runName}/evidence/ev-1`,
    );
    expect(evidenceRes.status).toBe(200);
    const evidence = (await evidenceRes.json()) as Record<string, unknown>;
    expect(evidence).toEqual(
      expect.objectContaining({
        evidenceID: "ev-1",
        sourceType: "message",
        excerpt: expect.stringContaining(
          "full evidence text loaded by the expandable evidence panel",
        ),
      }),
    );
  });

  test("GET / serves the SPA shell", async () => {
    if (shouldSkip) return;
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<div id="root">');
  });

  test("GET /assets/index.js serves bundled JS", async () => {
    if (shouldSkip) return;
    const expectedAsset = readFileSync(join(projectDir, "web/dist/index.html"), "utf8");
    const scriptMatch = expectedAsset.match(/src="(\/assets\/[^"]+)"/);
    expect(scriptMatch).not.toBeNull();
    const assetPath = scriptMatch![1]!.replace(/^\//, "");
    const assetUrl = `http://127.0.0.1:${port}/${assetPath}`;
    const res = await fetch(assetUrl);
    expect(res.status).toBe(200);
    const js = await res.text();
    expect(js.length).toBeGreaterThan(100);
    expect(js).toContain("useState");
  });
});
