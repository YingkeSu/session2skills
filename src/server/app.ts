import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { access, readFile, readdir, stat, mkdir } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateSkill } from "../generate/evaluate-skill.js";
import { generateSkillRun, type GenerateSkillRunInput, type EvidenceConfig } from "../generate/service.js";
import { parseTemplate, type TemplateName } from "../generate/templates.js";
import { parseSkillType, type SkillType } from "../generate/skill-types.js";
import { coercePositiveInteger, coerceTonePreset, type TonePreset } from "../shared/cli.js";
import { CliUsageError, toErrorMessage } from "../shared/errors.js";
import { isValidRunName, normalizeRunName, validateProjectDirectory } from "../shared/paths.js";
import type { RunSummary } from "../shared/run-summary.js";
import {
  listAvailableAdapters,
  createSessionProviderForType,
  listProjectsForAdapter,
  type AdapterType,
  type ProviderHandle,
} from "../adapters/registry.js";
import type { SessionMeta } from "../normalize/models.js";
import {
  writeProgress,
  readProgress,
  createInitialProgress,
  advanceProgress,
  markProgressDone,
  markProgressError,
  markProgressNoClaims,
  markProgressInterrupted,
  isTerminalStage,
  type GenerationStage,
} from "../generate/progress.js";
import type { HarnessStageName } from "../harness/run-harness.js";

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

export type SessionSelectionInput = {
  adapter: AdapterType;
  sessionId: string;
};

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

  void reconcileOrphanedRuns(runsDirectory);

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

  app.get("/api/runs/:name/progress", async (c) => {
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

    const progress = await readProgress(runDir);
    if (!progress) {
      return c.json({ stage: "idle", completedStages: [] });
    }

    return c.json(progress);
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
        skillType: string;
        async: boolean;
        directory: string;
        evidenceConfig?: {
          tokenBudget?: number;
          maxChars?: number;
          maxItems?: number;
        };
        sessionSelections?: Array<{ adapter: string; sessionId: string }>;
      }>>();

      const recent = coercePositiveInteger(body.recent, 10);
      const tone = coerceTonePreset(body.tone, "balanced");
      const force = body.force === true;
      const isAsync = body.async === true;
      const workspace = typeof body.workspace === "string" && body.workspace.length > 0
        ? body.workspace
        : undefined;
      const template = typeof body.template === "string" && body.template.length > 0
        ? parseTemplate(body.template)
        : undefined;
      const skillType = typeof body.skillType === "string" && body.skillType.length > 0
        ? parseSkillType(body.skillType)
        : undefined;
      const evidenceConfig: EvidenceConfig | undefined = body.evidenceConfig && typeof body.evidenceConfig === "object" ? {
        tokenBudget: typeof body.evidenceConfig.tokenBudget === "number" ? body.evidenceConfig.tokenBudget : undefined,
        maxChars: typeof body.evidenceConfig.maxChars === "number" ? body.evidenceConfig.maxChars : undefined,
        maxItems: typeof body.evidenceConfig.maxItems === "number" ? body.evidenceConfig.maxItems : undefined,
      } : undefined;
      const sessionSelections = Array.isArray(body.sessionSelections)
        ? body.sessionSelections.map((s) => ({
            adapter: s.adapter as AdapterType,
            sessionId: s.sessionId,
          }))
        : undefined;
      const name = normalizeRunName(body.name);
      const outputDirectory = join(runsDirectory, name);

      let projectDirectory = options.projectDirectory;
      if (typeof body.directory === "string" && body.directory.length > 0 && body.directory !== ".") {
        try {
          projectDirectory = validateProjectDirectory(resolve(body.directory));
        } catch (error) {
          if (error instanceof CliUsageError) {
            return c.json({ error: error.message }, 400);
          }
          throw error;
        }
      }

      if (isAsync) {
        await mkdir(outputDirectory, { recursive: true });
        const initialProgress = createInitialProgress();
        await writeProgress(outputDirectory, initialProgress);

        const stageMapping: Record<HarnessStageName, GenerationStage> = {
          analyst: "analyst",
          skeptic: "skeptic",
          writer: "writer",
          verifier: "verifier",
        };

        void (async () => {
          let currentProgress = initialProgress;
          try {
            await generateRun({
              projectDirectory,
              outputDirectory,
              workspace,
              recent,
              tone,
              force,
              template,
              skillType,
              evidenceConfig,
              sessionSelections,
              onStageComplete: (stage: HarnessStageName) => {
                const nextMap: Record<HarnessStageName, GenerationStage> = {
                  analyst: "skeptic",
                  skeptic: "writer",
                  writer: "verifier",
                  verifier: "done",
                };
                currentProgress = advanceProgress(currentProgress, stageMapping[stage], nextMap[stage]);
                void writeProgress(outputDirectory, currentProgress);
              },
            });
            try {
              const manifestRaw = await readFile(join(outputDirectory, "claim-manifest.json"), "utf8");
              const parsed: unknown = JSON.parse(manifestRaw);
              const claimCount = typeof parsed === "object" && parsed !== null && "claims" in parsed && Array.isArray((parsed as { claims: unknown[] }).claims)
                ? (parsed as { claims: unknown[] }).claims.length
                : -1;
              currentProgress = claimCount === 0
                ? markProgressNoClaims(currentProgress)
                : markProgressDone(currentProgress);
            } catch {
              currentProgress = markProgressDone(currentProgress);
            }
            await writeProgress(outputDirectory, currentProgress);
          } catch (error: unknown) {
            currentProgress = markProgressError(
              currentProgress,
              error instanceof Error ? error.message : String(error),
            );
            await writeProgress(outputDirectory, currentProgress);
          }
        })();

        return c.json({ name, status: "running" }, 202);
      }

      await generateRun({
        projectDirectory,
        outputDirectory,
        workspace,
        recent,
        tone,
        force,
        template,
        skillType,
        evidenceConfig,
        sessionSelections,
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

  app.get("/api/projects", async (c) => {
    const adapter = c.req.query("adapter");
    if (!adapter) {
      return c.json({ error: "Missing required query param: adapter" }, 400);
    }
    try {
      const projects = await listProjectsForAdapter(adapter);
      return c.json(projects);
    } catch (error) {
      if (error instanceof CliUsageError) {
        return c.json({ error: error.message }, 400);
      }
      return c.json({ error: `Failed to list projects: ${toErrorMessage(error)}` }, 500);
    }
  });

  app.get("/api/adapters", async (c) => {
    try {
      const providerOpts = { directory: options.projectDirectory };
      const available = await listAvailableAdapters(providerOpts);
      const availableTypes = new Set(available.map((a) => a.adapterType));
      const fallbackSourceType: Record<AdapterType, "file" | "sqlite" | "sdk"> = {
        sdk: "sdk",
        sqlite: "sqlite",
        codex: "sqlite",
        claude: "file",
      };

      const allAdapters: AdapterType[] = ["sdk", "sqlite", "codex", "claude"];
      const body = allAdapters.map((type) => {
        const found = available.find((a) => a.adapterType === type);
        if (found) {
          return {
            type,
            available: true,
            sourceType: found.sourceType,
            sourcePath: found.sourcePath,
          };
        }
        return {
          type,
          available: false,
          sourceType: fallbackSourceType[type],
          sourcePath: null,
        };
      });

      return c.json(body);
    } catch {
      return c.json({ error: "Failed to list adapters" }, 500);
    }
  });

  app.get("/api/sessions", async (c) => {
    try {
      const adapterParam = c.req.query("adapter") ?? undefined;
      const directory = c.req.query("directory") ?? options.projectDirectory;
      const workspace = c.req.query("workspace") ?? undefined;
      const recent = coercePositiveInteger(
        c.req.query("recent") ? Number(c.req.query("recent")) : undefined,
        20,
      );
      const search = c.req.query("search")?.toLowerCase() ?? undefined;

      const providerOpts = { directory, workspace };

      const availableAdapters = await listAvailableAdapters(providerOpts);
      const sourceTypeMap = new Map<AdapterType, "file" | "sqlite" | "sdk">(
        availableAdapters.map((a) => [a.adapterType, a.sourceType] as const),
      );
      const fallbackSourceType: Record<AdapterType, "file" | "sqlite" | "sdk"> = {
        sdk: "sdk",
        sqlite: "sqlite",
        codex: "sqlite",
        claude: "file",
      };

      let adapterTypes: Array<AdapterType>;
      if (adapterParam === "all") {
        adapterTypes = availableAdapters.map((a) => a.adapterType);
      } else if (adapterParam) {
        const KNOWN_ADAPTERS: ReadonlySet<string> = new Set(["sdk", "sqlite", "codex", "claude"]);
        if (!KNOWN_ADAPTERS.has(adapterParam)) {
          return c.json({ error: `Unknown adapter: ${adapterParam}` }, 400);
        }
        adapterTypes = [adapterParam as AdapterType];
      } else {
        adapterTypes = availableAdapters.length > 0 ? [availableAdapters[0]!.adapterType] : ["sdk"];
      }

      const allMeta: Array<SessionMeta> = [];
      const adapterErrors: Array<{ adapter: string; error: string }> = [];

      for (const adapterType of adapterTypes) {
        let handle: ProviderHandle | undefined;
        try {
          handle = await createSessionProviderForType(adapterType, providerOpts);
        } catch (err: unknown) {
          adapterErrors.push({
            adapter: adapterType,
            error: err instanceof Error ? err.message : String(err),
          });
          continue;
        }

        try {
          const sessions = await handle.provider.listRecentSessions(providerOpts, recent);
          const sourceType = sourceTypeMap.get(adapterType) ?? fallbackSourceType[adapterType];
          for (const session of sessions) {
            const title = session.title ?? null;
            if (search) {
              const haystack = (title ?? "").toLowerCase();
              if (!haystack.includes(search)) {
                continue;
              }
            }
            allMeta.push({
              providerId: adapterType,
              sessionId: session.id,
              title,
              sourceType,
              sourcePath: null,
              updatedAt: session.updatedAt ?? null,
              messageCount: null,
            });
          }
        } catch (err: unknown) {
          adapterErrors.push({
            adapter: adapterType,
            error: err instanceof Error ? err.message : String(err),
          });
        } finally {
          await handle.close();
        }
      }

      if (adapterErrors.length > 0) {
        c.header("X-Adapter-Errors", JSON.stringify(adapterErrors));
      }
      return c.json(allMeta);
    } catch {
      return c.json({ error: "Failed to list sessions" }, 500);
    }
  });

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

    const [manifest, skillAvailable, summaryAvailable, progress] = await Promise.all([
      readJsonSafe(join(runDir, "claim-manifest.json")),
      fileExists(join(runDir, "SKILL.md")),
      fileExists(join(runDir, "summary.md")),
      readProgress(runDir),
    ]);
    if (!manifest && !skillAvailable && !summaryAvailable) {
      continue;
    }

    const [verifierReport, skepticReport, model] = await Promise.all([
      readJsonSafe(join(runDir, "verifier-report.json")),
      readJsonSafe(join(runDir, "skeptic-report.json")),
      readModelFromTraces(runDir),
    ]);

    const progressStage = deriveProgressStage(progress);

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
      ...(progressStage !== undefined ? { progressStage } : {}),
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

function deriveProgressStage(
  progress: { stage: GenerationStage } | null,
): GenerationStage | undefined {
  if (!progress) return undefined;
  if (progress.stage === "done" || progress.stage === "no-claims") return undefined;
  return progress.stage;
}

/**
 * On server boot, walk every run directory and fix orphaned .progress.json files
 * left behind by a previous process that died mid-generation (issue #73).
 *
 * Reconciliation rules for non-terminal stages:
 * - SKILL.md exists → the generation actually completed before the crash; mark done.
 * - SKILL.md missing → the run was genuinely interrupted; mark interrupted.
 *
 * Terminal stages (done / error / no-claims / interrupted) are left untouched.
 */
export async function reconcileOrphanedRuns(runsDirectory: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(runsDirectory);
  } catch {
    return;
  }

  await Promise.all(
    entries.map((entry) => reconcileRunProgress(join(runsDirectory, entry))),
  );
}

async function reconcileRunProgress(runDir: string): Promise<void> {
  try {
    const dirStat = await stat(runDir);
    if (!dirStat.isDirectory()) return;
  } catch {
    return;
  }

  const progress = await readProgress(runDir);
  if (!progress || isTerminalStage(progress.stage)) return;

  const skillExists = await fileExists(join(runDir, "SKILL.md"));
  const reconciled = skillExists
    ? markProgressDone(progress)
    : markProgressInterrupted(progress, "Server restarted before generation completed");

  try {
    await writeProgress(runDir, reconciled);
  } catch {}
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
