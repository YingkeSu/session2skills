/**
 * Standalone, forkable generation worker (issue #75).
 *
 * Spawned by the HTTP server via `child_process.fork()` so that an async
 * generation survives a server restart: the worker is a separate process that
 * writes its own PID + per-stage checkpoints into `.progress.json`. On server
 * reboot, `reconcileOrphanedRuns` checks PID liveness before reconciling, and
 * `POST /api/runs/:name/resume` can re-fork a worker to continue a dead run.
 *
 * Input contract: a single JSON object on stdin matching {@link WorkerInput}.
 * The provider/prompt registry are resolved inside the worker from
 * `SESSION2SKILLS_*` env vars (inherited from the parent process on fork).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { generateSkillRun, type GenerateSkillRunInput } from "../generate/service.js";
import type { EvidenceConfig } from "../harness/packets.js";
import type { HarnessStageName } from "../harness/run-harness.js";
import {
  advanceProgress,
  createInitialProgress,
  hashArtifact,
  markProgressDone,
  markProgressError,
  markProgressNoClaims,
  readProgress,
  STAGE_ARTIFACT_FILE,
  writeProgress,
  type GenerationStage,
  type ProgressFile,
} from "../generate/progress.js";
import { loadTemplateMarkdown, type TemplateName } from "../generate/templates.js";
import type { SkillType } from "../generate/skill-types.js";
import type { TonePreset } from "../shared/cli.js";
import type { SessionSelection } from "../sessions/load-specific-sessions.js";

/** Serializable subset of {@link GenerateSkillRunInput} that crosses the fork boundary. */
export type WorkerInput = {
  projectDirectory: string;
  outputDirectory: string;
  workspace?: string;
  recent: number;
  force: boolean;
  tone: TonePreset;
  template?: TemplateName;
  skillType?: SkillType;
  evidenceConfig?: EvidenceConfig;
  sessionSelections?: Array<SessionSelection>;
};

const STAGE_TO_GENERATION_STAGE: Record<HarnessStageName, GenerationStage> = {
  analyst: "analyst",
  skeptic: "skeptic",
  writer: "writer",
  verifier: "verifier",
};

const NEXT_STAGE: Record<HarnessStageName, GenerationStage> = {
  analyst: "skeptic",
  skeptic: "writer",
  writer: "verifier",
  verifier: "done",
};

async function readStdin(): Promise<string> {
  return new Promise((resolveFn, rejectFn) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolveFn(data));
    process.stdin.on("error", rejectFn);
  });
}

export function parseWorkerInput(raw: string): WorkerInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    throw new Error(
      `worker: invalid JSON on stdin: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("worker: expected a JSON object on stdin");
  }
  const obj = parsed as Record<string, unknown>;
  const projectDirectory = obj["projectDirectory"];
  const outputDirectory = obj["outputDirectory"];
  if (typeof projectDirectory !== "string" || typeof outputDirectory !== "string") {
    throw new Error("worker: projectDirectory and outputDirectory are required strings");
  }
  return {
    projectDirectory,
    outputDirectory,
    ...(typeof obj["workspace"] === "string" ? { workspace: obj["workspace"] } : {}),
    recent: typeof obj["recent"] === "number" ? obj["recent"] : 10,
    force: obj["force"] === true,
    tone: (typeof obj["tone"] === "string" ? obj["tone"] : "balanced") as TonePreset,
    ...(typeof obj["template"] === "string" ? { template: obj["template"] as TemplateName } : {}),
    ...(typeof obj["skillType"] === "string" ? { skillType: obj["skillType"] as SkillType } : {}),
    ...(obj["evidenceConfig"] && typeof obj["evidenceConfig"] === "object"
      ? { evidenceConfig: obj["evidenceConfig"] as EvidenceConfig }
      : {}),
    ...(Array.isArray(obj["sessionSelections"])
      ? { sessionSelections: obj["sessionSelections"] as Array<SessionSelection> }
      : {}),
  };
}

async function recordCheckpointIfExists(
  outputDirectory: string,
  stage: HarnessStageName,
): Promise<string | undefined> {
  try {
    const content = await readFile(join(outputDirectory, STAGE_ARTIFACT_FILE[stage]), "utf8");
    return hashArtifact(content);
  } catch {
    return undefined;
  }
}

/**
 * Drive a single generation to completion, writing progress (with PID +
 * checkpoints) at every stage boundary. Exported for unit testing.
 */
export async function runWorkerJob(input: WorkerInput): Promise<void> {
  const pid = process.pid;
  const existing = await readProgress(input.outputDirectory);
  let progress: ProgressFile = existing ?? createInitialProgress();
  progress = { ...progress, pid };

  const stageMapping: Record<HarnessStageName, GenerationStage> = STAGE_TO_GENERATION_STAGE;

  const generateInput: GenerateSkillRunInput = {
    projectDirectory: input.projectDirectory,
    outputDirectory: input.outputDirectory,
    recent: input.recent,
    force: input.force,
    tone: input.tone,
    ...(input.workspace !== undefined ? { workspace: input.workspace } : {}),
    ...(input.template !== undefined
      ? { templateMarkdown: await loadTemplateMarkdown(input.template) }
      : {}),
    ...(input.skillType !== undefined ? { skillType: input.skillType } : {}),
    ...(input.evidenceConfig !== undefined ? { evidenceConfig: input.evidenceConfig } : {}),
    ...(input.sessionSelections !== undefined
      ? { sessionSelections: input.sessionSelections }
      : {}),
    onStageComplete: (stage: HarnessStageName) => {
      // The harness flushes per-stage artifacts only at the very end of
      // `generateSkillRun`, so a checkpoint hash is usually not available at
      // this boundary — we record one opportunistically when the artifact is
      // already on disk (e.g. a resumed run whose earlier stages left files).
      progress = advanceProgress(progress, stageMapping[stage], NEXT_STAGE[stage]);
      progress = { ...progress, pid };
      void recordCheckpointIfExists(input.outputDirectory, stage).then((hash) => {
        if (hash !== undefined) {
          progress = {
            ...progress,
            completedStageCheckpoints: {
              ...progress.completedStageCheckpoints,
              [stage]: hash,
            },
          };
          void writeProgress(input.outputDirectory, progress);
        }
      });
      void writeProgress(input.outputDirectory, progress);
    },
  };

  try {
    await generateSkillRun(generateInput);
    let claimCount = -1;
    try {
      const manifestRaw = await readFile(join(input.outputDirectory, "claim-manifest.json"), "utf8");
      const parsed: unknown = JSON.parse(manifestRaw);
      claimCount =
        typeof parsed === "object" && parsed !== null && "claims" in parsed && Array.isArray((parsed as { claims: unknown[] }).claims)
          ? (parsed as { claims: unknown[] }).claims.length
          : -1;
    } catch {
      claimCount = -1;
    }
    progress = claimCount === 0 ? markProgressNoClaims(progress) : markProgressDone(progress);
    progress = { ...progress, pid };
    await writeProgress(input.outputDirectory, progress);
  } catch (error: unknown) {
    progress = markProgressError(progress, error instanceof Error ? error.message : String(error));
    progress = { ...progress, pid };
    await writeProgress(input.outputDirectory, progress);
    throw error;
  }
}

async function main(): Promise<void> {
  const raw = await readStdin();
  const input = parseWorkerInput(raw);
  await runWorkerJob(input);
}

/**
 * Entry-point guard: only auto-run when executed directly (not when imported by
 * tests). `process.argv[1]` is the script path under `node`.
 */
if (process.argv[1] && process.argv[1].endsWith("generate-worker.js")) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    // Surface the failure reason on stderr before exiting non-zero. Progress
    // has already been marked `error` by runWorkerJob.
    process.stderr.write(`generate-worker failed: ${message}\n`);
    process.exit(1);
  });
}
