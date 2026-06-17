import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

const projectDir = process.cwd();

function waitForStdout(child: ChildProcess, needle: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for "${needle}" in stdout. Got:\n${buffer}`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      if (buffer.includes(needle)) {
        clearTimeout(timer);
        resolve(buffer);
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited early with code ${code}. stdout:\n${buffer}`));
    });
  });
}

async function waitForServer(port: number, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`Server at port ${port} did not become healthy within ${timeoutMs}ms`);
}

function pickPort(): number {
  return 49000 + Math.floor(Math.random() * 1000);
}

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

    const runsDir = join(tempRoot, "generated-skills", "alpha-run");
    await mkdir(runsDir, { recursive: true });

    await writeFile(
      join(runsDir, "claim-manifest.json"),
      JSON.stringify({
        schemaVersion: "claim-manifest/v1",
        claims: [
          {
            id: "c1",
            dimension: "planning",
            label: "Clarify constraints before editing",
            confidence: 0.84,
            rationale:
              "The user explicitly asks the worker to read task constraints before implementation.",
            evidenceRefs: ["ev-1"],
          },
          {
            id: "c2",
            dimension: "verification",
            label: "Run focused checks after changes",
            confidence: 0.91,
            rationale:
              "The task packet requires focused e2e verification after changing fixture coverage.",
            evidenceRefs: ["ev-2"],
          },
          {
            id: "c3",
            dimension: "verification",
            label: "Report commands and results",
            confidence: 0.78,
            rationale:
              "The handoff format asks for command results in the final response and completion report.",
            evidenceRefs: [],
          },
        ],
        evidenceSummary:
          "The session shows a repeated preference for constraint-first implementation and focused verification.",
        dimensionsCovered: ["planning", "verification"],
        evidence: [
          {
            evidenceID: "ev-1",
            sourceType: "message",
            excerpt:
              "Constraint-first short preview; full evidence text loaded by the expandable evidence panel.",
          },
          {
            evidenceID: "ev-2",
            sourceType: "tool",
            excerpt:
              "Focused e2e command output confirms the serve flow after fixture updates.",
          },
        ],
        metadata: { generatedAt: "2026-06-14T12:00:00.000Z", sessionCount: 2, totalEvidenceItems: 5 },
      }),
    );
    await writeFile(
      join(runsDir, "skeptic-report.json"),
      JSON.stringify({
        schemaVersion: "skeptic-report/v1",
        issues: [
          {
            claimId: "c1",
            severity: "medium",
            problemType: "thin-evidence",
            detail: "Only one direct excerpt supports the planning claim.",
            suggestion:
              "Keep the directive narrow and tie it to explicit task packets.",
          },
        ],
        overallScore: 0.72,
        metadata: { generatedAt: "2026-06-14T12:00:00.000Z", claimCount: 3, issueCount: 1 },
      }),
    );
    await writeFile(
      join(runsDir, "verifier-report.json"),
      JSON.stringify({
        schemaVersion: "verifier-report/v1",
        pass: true,
        checkedItems: [
          {
            directive: "Ask for constraints before touching files.",
            claimId: "c1",
            status: "verified",
          },
          {
            directive: "Run focused tests after each e2e fixture change.",
            claimId: "c2",
            status: "verified",
          },
          {
            directive: "Include command outcomes in the completion report.",
            claimId: "c3",
            status: "verified",
          },
        ],
        issues: [],
        metadata: { generatedAt: "2026-06-14T12:00:00.000Z", directiveCount: 3, verifiedCount: 3, fabricatedCount: 0 },
      }),
    );
    await writeFile(
      join(runsDir, "llm-traces.json"),
      JSON.stringify([
        {
          schemaVersion: "llm-trace/v1",
          traceID: "t1",
          model: "glm-4.7",
          stage: "analyst",
          provider: "zhipuai",
          usage: { prompt_tokens: 30, completion_tokens: 12, total_tokens: 42 },
          latencyMs: 1200,
          finishReason: "stop",
          promptName: "claim-analysis",
          request: { promptName: "claim-analysis", messages: [] },
          response: { finishReason: "stop" },
        },
      ]),
    );
    await writeFile(
      join(runsDir, "writer-output.json"),
      JSON.stringify({
        sections: [
          {
            title: "Constraints and anti-patterns",
            summary: "Keep directives grounded in observed evidence.",
            groundingClaimIds: ["c1", "c2"],
            directives: [
              {
                text: "Use evidence before generalizing.",
                sourceClaimId: "c2",
              },
            ],
          },
        ],
      }),
    );
    await writeFile(
      join(runsDir, "SKILL.md"),
      "# Alpha Skill\n\n- Use evidence before generalizing.\n",
    );

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
    expect(body[0]!.name).toBe("alpha-run");
    expect(body[0]!.model).toBe("glm-4.7");
    expect(body[0]!.generatedAt).toBe("2026-06-14T12:00:00.000Z");
    expect(body[0]!.verifierPassed).toBe(true);
    expect(body[0]!.claimCount).toBe(3);
    expect(body[0]!.skepticScore).toBe(0.72);
    expect(body[0]!.skepticIssueCount).toBe(1);
  });

  test("served APIs expose the data needed for the list-detail-tab-evidence UI flow", async () => {
    if (shouldSkip) return;

    const runsRes = await fetch(`http://127.0.0.1:${port}/api/runs`);
    expect(runsRes.status).toBe(200);
    const runs = (await runsRes.json()) as Array<Record<string, unknown>>;
    expect(runs).toEqual([
      expect.objectContaining({
        name: "alpha-run",
        model: "glm-4.7",
        verifierPassed: true,
        claimCount: 3,
        skepticScore: 0.72,
        skepticIssueCount: 1,
      }),
    ]);

    const detailRes = await fetch(`http://127.0.0.1:${port}/api/runs/alpha-run`);
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as Record<string, unknown>;
    expect(detail["name"]).toBe("alpha-run");
    expect(detail["skillMarkdown"]).toContain(
      "Use evidence before generalizing",
    );

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
        usage: expect.objectContaining({ total_tokens: 42 }),
        latencyMs: 1200,
        finishReason: "stop",
        promptName: "claim-analysis",
      }),
    ]);

    const evidenceRes = await fetch(
      `http://127.0.0.1:${port}/api/runs/alpha-run/evidence/ev-1`,
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
