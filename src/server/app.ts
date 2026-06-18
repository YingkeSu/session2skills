import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateSkill } from "../generate/evaluate-skill.js";
import { generateSkillRun, type GenerateSkillRunInput } from "../generate/service.js";
import { parseTemplate, type TemplateName } from "../generate/templates.js";
import { coercePositiveInteger, coerceTonePreset, type TonePreset } from "../shared/cli.js";
import { CliUsageError } from "../shared/errors.js";
import { isValidRunName, normalizeRunName } from "../shared/paths.js";
import type { RunSummary } from "../shared/run-summary.js";

// dist/server/app.js → ../../web/dist
const __dirname = dirname(fileURLToPath(import.meta.url));
const webDist = join(__dirname, "../../web/dist");

function getApiToken(): string | null {
  return process.env["SESSION2SKILLS_API_TOKEN"] ?? null;
}

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

export type ServerGenerateRunner = (input: GenerateSkillRunInput) => Promise<unknown>;

export type CreateServerOptions = {
  projectDirectory: string;
  generateRun?: ServerGenerateRunner;
};

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    // Allow localhost, 127.0.0.1, and private network IPs (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("10.") ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname) ||
      hostname.startsWith("192.168.")
    );
  } catch {
    return false;
  }
}

export function createServer(runsDirectory: string, options: CreateServerOptions): Hono {
  const app = new Hono();
  const generateRun = options.generateRun ?? generateSkillRun;
  const apiToken = getApiToken();

  app.use("/api/*", async (c, next) => {
    const origin = c.req.header("Origin");
    if (origin && !isAllowedOrigin(origin)) {
      return c.json({ error: "Origin not allowed" }, 403);
    }
    await next();
  });

  app.use("/api/*", cors());

  app.use("/api/runs", async (c, next) => {
    if (c.req.method === "POST" && apiToken) {
      const token = extractBearerToken(c.req.header("Authorization"));
      if (token !== apiToken) {
        return c.json({ error: "Unauthorized" }, 401);
      }
    }
    await next();
  });

  app.use("/api/runs/:name/evaluate", async (c, next) => {
    if (c.req.method === "POST" && apiToken) {
      const token = extractBearerToken(c.req.header("Authorization"));
      if (token !== apiToken) {
        return c.json({ error: "Unauthorized" }, 401);
      }
    }
    await next();
  });

  app.get("/api/runs", async (c) => {
    try {
      const runs = await scanRuns(runsDirectory);
      return c.json(runs);
    } catch {
      return c.json({ error: "Failed to scan runs" }, 500);
    }
  });

  app.get("/api/runs/:name", async (c) => {
    const name = c.req.param("name");

    if (!isValidRunName(name)) {
      return c.json({ error: "Invalid run name" }, 400);
    }

    const runDir = join(runsDirectory, name);

    try {
      const dirStat = await stat(runDir);
      if (!dirStat.isDirectory()) {
        return c.json({ error: `Run not found: ${name}` }, 404);
      }
    } catch {
      return c.json({ error: `Run not found: ${name}` }, 404);
    }

    try {
      const [claimManifestRaw, skepticReportRaw, verifierReportRaw, llmTracesRaw] =
        await Promise.all([
          readJsonSafe(join(runDir, "claim-manifest.json")),
          readJsonSafe(join(runDir, "skeptic-report.json")),
          readJsonSafe(join(runDir, "verifier-report.json")),
          readJsonArraySafe(join(runDir, "llm-traces.json")),
        ]);

      const claimManifest = claimManifestRaw as Record<string, unknown> | null;
      const skepticReport = skepticReportRaw as Record<string, unknown> | null;
      const verifierReport = verifierReportRaw as Record<string, unknown> | null;
      const llmTraces = llmTracesRaw as unknown[] | null;

      let skillMarkdown: string | null = null;
      let writerSections: Record<string, unknown> | null = null;
      try {
        skillMarkdown = await readFile(join(runDir, "SKILL.md"), "utf8");
      } catch {}
      try {
        const raw = await readFile(join(runDir, "writer-output.json"), "utf8");
        const parsed: unknown = JSON.parse(raw);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          !Array.isArray(parsed)
        ) {
          writerSections = parsed as Record<string, unknown>;
        }
      } catch {}

      const traces: Array<Record<string, unknown>> = Array.isArray(
        llmTraces
      )
        ? (llmTraces as Array<Record<string, unknown>>)
        : [];

      return c.json({
        name,
        claimManifest: claimManifest ?? null,
        skepticReport: skepticReport ?? null,
        verifierReport: verifierReport ?? null,
        writerSections,
        skillMarkdown,
        traces,
      });
    } catch {
      return c.json(
        { error: `Failed to read run artifacts: ${name}` },
        500
      );
    }
  });

  app.get("/api/runs/:name/evidence/:evidenceId", async (c) => {
    const name = c.req.param("name");
    const evidenceId = c.req.param("evidenceId");

    if (!isValidRunName(name)) {
      return c.json({ error: "Invalid run name" }, 400);
    }

    const runDir = join(runsDirectory, name);

    try {
      const dirStat = await stat(runDir);
      if (!dirStat.isDirectory()) {
        return c.json({ error: `Run not found: ${name}` }, 404);
      }
    } catch {
      return c.json({ error: `Run not found: ${name}` }, 404);
    }

    try {
      const manifestRaw = await readJsonSafe(join(runDir, "claim-manifest.json"));
      if (!manifestRaw) {
        return c.json({ error: "Manifest not found" }, 404);
      }

      const evidence = manifestRaw["evidence"];
      if (!Array.isArray(evidence)) {
        return c.json({ error: "Evidence array not found" }, 404);
      }

      const item = evidence.find(
        (entry: unknown) =>
          typeof entry === "object" &&
          entry !== null &&
          (entry as Record<string, unknown>)["evidenceID"] === evidenceId
      );

      if (!item) {
        return c.json({ error: "Evidence not found" }, 404);
      }

      return c.json(item);
    } catch {
      return c.json({ error: "Failed to read evidence" }, 500);
    }
  });

  app.post("/api/runs/:name/evaluate", async (c) => {
    const name = c.req.param("name");

    if (!isValidRunName(name)) {
      return c.json({ error: "Invalid run name" }, 400);
    }

    const runDir = join(runsDirectory, name);

    try {
      const dirStat = await stat(runDir);
      if (!dirStat.isDirectory()) {
        return c.json({ error: `Run not found: ${name}` }, 404);
      }
    } catch {
      return c.json({ error: `Run not found: ${name}` }, 404);
    }

    try {
      const evaluation = await evaluateSkill({ skillDirectory: runDir });
      return c.json(evaluation);
    } catch {
      return c.json({ error: `Failed to evaluate run: ${name}` }, 500);
    }
  });

  app.post("/api/runs", async (c) => {
    try {
      const body = await c.req.json<Partial<{
        name: string;
        recent: number;
        workspace: string;
        tone: TonePreset;
        force: boolean;
        template: string;
      }>>();

      const recent = coercePositiveInteger(body.recent, 10);
      const tone = coerceTonePreset(body.tone, "balanced");
      const force = body.force === true;
      const workspace = typeof body.workspace === "string" && body.workspace.length > 0
        ? body.workspace
        : undefined;
      const template = typeof body.template === "string" && body.template.length > 0
        ? parseTemplate(body.template)
        : undefined;
      const name = normalizeRunName(body.name);
      const outputDirectory = join(runsDirectory, name);

      await generateRun({
        projectDirectory: options.projectDirectory,
        outputDirectory,
        workspace,
        recent,
        tone,
        force,
        template,
      });

      const summaries = await scanRuns(runsDirectory);
      const generated = summaries.find((summary) => summary.name === name);
      if (!generated) {
        return c.json({ error: `Generated run not found: ${name}` }, 500);
      }

      return c.json(generated, 201);
    } catch (error) {
      if (error instanceof CliUsageError) {
        return c.json({ error: error.message }, 400);
      }
      return c.json({ error: "Failed to generate run" }, 500);
    }
  });

  app.get("/api/health", (c) => c.json({ status: "ok" }));

  if (existsSync(webDist)) {
    app.use("/assets/*", serveStatic({ root: webDist }));
    app.get("*", serveStatic({ root: webDist, path: "index.html" }));
  }

  return app;
}

/**
 * Summarize every generated skill directory inside `runsDirectory`.
 * A subdirectory is counted when it has at least one recognized artifact.
 */
export async function scanRuns(runsDirectory: string): Promise<RunSummary[]> {
  let entries: string[];
  try {
    entries = await readdir(runsDirectory);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return [];
    }
    throw err;
  }

  const summaries: RunSummary[] = [];

  for (const entry of entries) {
    const runDir = join(runsDirectory, entry);
    const dirStat = await stat(runDir).catch(() => null);
    if (!dirStat || !dirStat.isDirectory()) {
      continue;
    }

    const [manifest, skillAvailable, summaryAvailable] = await Promise.all([
      readJsonSafe(join(runDir, "claim-manifest.json")),
      fileExists(join(runDir, "SKILL.md")),
      fileExists(join(runDir, "summary.md")),
    ]);
    if (!manifest && !skillAvailable && !summaryAvailable) {
      continue;
    }

    const [verifierReport, skepticReport, model] = await Promise.all([
      readJsonSafe(join(runDir, "verifier-report.json")),
      readJsonSafe(join(runDir, "skeptic-report.json")),
      readModelFromTraces(runDir),
    ]);

    summaries.push({
      name: entry,
      model,
      generatedAt: manifest ? readGeneratedAt(manifest) : "",
      verifierPassed: readVerifierPassed(verifierReport),
      claimCount: manifest ? readClaimCount(manifest) : 0,
      skepticScore: readSkepticScore(skepticReport),
      skepticIssueCount: readSkepticIssueCount(skepticReport),
      artifactStatus: getArtifactStatus({
        hasManifest: manifest !== null,
        skillAvailable,
        summaryAvailable,
      }),
      skillAvailable,
      summaryAvailable,
    });
  }

  summaries.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));

  return summaries;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getArtifactStatus(input: {
  hasManifest: boolean;
  skillAvailable: boolean;
  summaryAvailable: boolean;
}): RunSummary["artifactStatus"] {
  if (!input.hasManifest && input.skillAvailable && !input.summaryAvailable) {
    return "legacy";
  }
  return input.hasManifest && input.skillAvailable && input.summaryAvailable
    ? "complete"
    : "partial";
}

async function readJsonSafe(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

async function readJsonArraySafe(filePath: string): Promise<unknown[] | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readGeneratedAt(manifest: Record<string, unknown>): string {
  const metadata = manifest["metadata"];
  if (typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, unknown>)["generatedAt"];
    if (typeof value === "string") {
      return value;
    }
  }
  return "";
}

function readClaimCount(manifest: Record<string, unknown>): number {
  return Array.isArray(manifest["claims"]) ? (manifest["claims"] as unknown[]).length : 0;
}

function readVerifierPassed(report: Record<string, unknown> | null): boolean {
  return report !== null && report["pass"] === true;
}

function readSkepticScore(report: Record<string, unknown> | null): number {
  if (!report) return 0;
  return typeof report["overallScore"] === "number" ? report["overallScore"] : 0;
}

function readSkepticIssueCount(report: Record<string, unknown> | null): number {
  if (!report) return 0;
  return Array.isArray(report["issues"]) ? (report["issues"] as unknown[]).length : 0;
}

async function readModelFromTraces(runDir: string): Promise<string> {
  try {
    const raw = await readFile(join(runDir, "llm-traces.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const trace of parsed) {
        if (typeof trace === "object" && trace !== null) {
          const model = (trace as Record<string, unknown>)["model"];
          if (typeof model === "string" && model.length > 0) {
            return model;
          }
        }
      }
    }
  } catch {
    // missing or malformed traces — default below
  }
  return "unknown";
}
