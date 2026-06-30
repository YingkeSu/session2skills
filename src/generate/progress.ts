import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { HarnessStageName } from "../harness/run-harness.js";

export type GenerationStage =
  | "analyst"
  | "skeptic"
  | "writer"
  | "verifier"
  | "done"
  | "error"
  | "no-claims"
  | "interrupted"
  | "resumable";

/**
 * Per-stage artifact filename written by the harness. Used to compute
 * resume checkpoints and to validate that a completed stage's output is
 * still on disk before resuming from it.
 */
export const STAGE_ARTIFACT_FILE: Record<HarnessStageName, string> = {
  analyst: "claim-manifest.json",
  skeptic: "skeptic-report.json",
  writer: "SKILL.md",
  verifier: "verifier-report.json",
};

/** Ordered harness stages, used to compute the stage following a resume point. */
export const HARNESS_STAGE_ORDER: ReadonlyArray<HarnessStageName> = [
  "analyst",
  "skeptic",
  "writer",
  "verifier",
];

export type ProgressFile = {
  stage: GenerationStage;
  completedStages: GenerationStage[];
  startedAt: string;
  updatedAt: string;
  error?: string;
  /** PID of the forked worker currently driving this generation, if any. */
  pid?: number;
  /**
   * SHA-256 hash of each completed stage's primary artifact, recorded when the
   * stage finishes. On resume, a mismatch (or missing file) means the cached
   * output is no longer trustworthy.
   */
  completedStageCheckpoints?: Partial<Record<HarnessStageName, string>>;
};

const PROGRESS_FILENAME = ".progress.json";

const TERMINAL_STAGES: ReadonlySet<GenerationStage> = new Set([
  "done",
  "error",
  "no-claims",
  "interrupted",
  "resumable",
]);

export function isTerminalStage(stage: GenerationStage): boolean {
  return TERMINAL_STAGES.has(stage);
}

export async function writeProgress(
  runDir: string,
  progress: ProgressFile,
): Promise<void> {
  const filePath = join(runDir, PROGRESS_FILENAME);
  await writeFile(filePath, JSON.stringify(progress, null, 2), "utf8");
}

export async function readProgress(
  runDir: string,
): Promise<ProgressFile | null> {
  const filePath = join(runDir, PROGRESS_FILENAME);
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as ProgressFile;
    }
    return null;
  } catch {
    return null;
  }
}

export function createInitialProgress(): ProgressFile {
  const now = new Date().toISOString();
  return {
    stage: "analyst",
    completedStages: [],
    startedAt: now,
    updatedAt: now,
  };
}

export function advanceProgress(
  current: ProgressFile,
  completedStage: GenerationStage,
  nextStage: GenerationStage,
): ProgressFile {
  return {
    ...current,
    stage: nextStage,
    completedStages: [...current.completedStages, completedStage],
    updatedAt: new Date().toISOString(),
  };
}

export function markProgressDone(current: ProgressFile): ProgressFile {
  return {
    ...current,
    stage: "done",
    updatedAt: new Date().toISOString(),
  };
}

export function markProgressError(
  current: ProgressFile,
  error: string,
): ProgressFile {
  return {
    ...current,
    stage: "error",
    updatedAt: new Date().toISOString(),
    error,
  };
}

export function markProgressNoClaims(current: ProgressFile): ProgressFile {
  return {
    ...current,
    stage: "no-claims",
    updatedAt: new Date().toISOString(),
  };
}

export function markProgressInterrupted(
  current: ProgressFile,
  reason: string,
): ProgressFile {
  return {
    ...current,
    stage: "interrupted",
    updatedAt: new Date().toISOString(),
    error: reason,
  };
}

export function markProgressResumable(
  current: ProgressFile,
  reason: string,
): ProgressFile {
  return {
    ...current,
    stage: "resumable",
    updatedAt: new Date().toISOString(),
    error: reason,
  };
}

/** Compute a stable SHA-256 hash for a stage artifact's bytes. */
export function hashArtifact(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Return the harness stage a resume should restart from, given the stages that
 * have already completed. The resume point is the stage immediately after the
 * last completed one (or the first stage if none completed). Returns `null`
 * when every stage is already complete (nothing to resume).
 */
export function resumeFromStage(
  completedStages: ReadonlyArray<HarnessStageName>,
): HarnessStageName | null {
  if (completedStages.length >= HARNESS_STAGE_ORDER.length) return null;
  return HARNESS_STAGE_ORDER[completedStages.length]!;
}
