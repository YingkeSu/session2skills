import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createServer } from "../../src/server/app.js";
import type { GenerateSkillRunInput } from "../../src/generate/service.js";

function validManifest(): Record<string, unknown> {
  return {
    schemaVersion: "claim-manifest/v1",
    claims: [{ id: "c1" }],
    evidenceSummary: "",
    dimensionsCovered: [],
    metadata: { generatedAt: "2026-01-01T00:00:00.000Z", sessionCount: 1, totalEvidenceItems: 1 },
  };
}

async function seedRunArtifacts(outputDirectory: string): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, "claim-manifest.json"), JSON.stringify(validManifest()));
  await writeFile(join(outputDirectory, "summary.md"), "# Summary\n");
  await writeFile(join(outputDirectory, "SKILL.md"), "# Generated Skill\n");
}

describe("POST /api/runs directory override", () => {
  let tempRoot: string;
  let runsDir: string;
  let customProjectDir: string;
  const testToken = "test-api-token-directory-override";

  beforeAll(async () => {
    process.env["SESSION2SKILLS_API_TOKEN"] = testToken;
    tempRoot = await mkdtemp(join(tmpdir(), "s2k-runs-dir-test-"));
    runsDir = join(tempRoot, "generated-skills");
    customProjectDir = await mkdtemp(join(tmpdir(), "custom-project-"));
  });

  afterAll(async () => {
    delete process.env["SESSION2SKILLS_API_TOKEN"];
    await rm(tempRoot, { recursive: true, force: true });
    await rm(customProjectDir, { recursive: true, force: true });
  });

  test("falls back to options.projectDirectory when body omits directory", async () => {
    const calls: Array<GenerateSkillRunInput> = [];
    const app = createServer(runsDir, {
      projectDirectory: tempRoot,
      generateRun: async (input) => {
        calls.push(input);
        await seedRunArtifacts(input.outputDirectory);
      },
    });

    const res = await app.request("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${testToken}` },
      body: JSON.stringify({ name: "fallback-run" }),
    });

    expect(res.status).toBe(201);
    expect(calls[0]!.projectDirectory).toBe(tempRoot);
  });

  test("uses body.directory when provided", async () => {
    const calls: Array<GenerateSkillRunInput> = [];
    const app = createServer(runsDir, {
      projectDirectory: tempRoot,
      generateRun: async (input) => {
        calls.push(input);
        await seedRunArtifacts(input.outputDirectory);
      },
    });

    const res = await app.request("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${testToken}` },
      body: JSON.stringify({ name: "override-run", directory: customProjectDir }),
    });

    expect(res.status).toBe(201);
    expect(calls[0]!.projectDirectory).toBe(customProjectDir);
  });

  test("returns 400 when body.directory does not exist", async () => {
    const app = createServer(runsDir, {
      projectDirectory: tempRoot,
      generateRun: async () => {
        throw new Error("should not be called");
      },
    });

    const res = await app.request("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${testToken}` },
      body: JSON.stringify({ name: "bad-dir", directory: join(tmpdir(), "definitely-nonexistent-" + Date.now()) }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/directory/i);
  });
});
