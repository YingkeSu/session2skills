import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { RunSummary } from "../shared/run-summary.js";

// dist/server/app.js → ../../web/dist
const __dirname = dirname(fileURLToPath(import.meta.url));
const webDist = join(__dirname, "../../web/dist");

export function createServer(runsDirectory: string): Hono {
  const app = new Hono();

  app.use("/api/*", cors());

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
          readJsonSafe(join(runDir, "llm-traces.json")),
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

  app.get("/api/health", (c) => c.json({ status: "ok" }));

  app.use("/assets/*", serveStatic({ root: webDist }));

  app.get("*", serveStatic({ root: webDist, path: "index.html" }));

  return app;
}

/**
 * Summarize every harness run inside `runsDirectory`.
 * A subdirectory is only counted when it has a claim-manifest.json.
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

    const manifest = await readJsonSafe(join(runDir, "claim-manifest.json"));
    if (!manifest) {
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
      generatedAt: readGeneratedAt(manifest),
      verifierPassed: readVerifierPassed(verifierReport),
      claimCount: readClaimCount(manifest),
      skepticScore: readSkepticScore(skepticReport),
      skepticIssueCount: readSkepticIssueCount(skepticReport),
    });
  }

  summaries.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));

  return summaries;
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
