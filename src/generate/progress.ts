import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type GenerationStage =
  | "analyst"
  | "skeptic"
  | "writer"
  | "verifier"
  | "done"
  | "error"
  | "no-claims"
  | "interrupted";

export type ProgressFile = {
  stage: GenerationStage;
  completedStages: GenerationStage[];
  startedAt: string;
  updatedAt: string;
  error?: string;
};

const PROGRESS_FILENAME = ".progress.json";

const TERMINAL_STAGES: ReadonlySet<GenerationStage> = new Set([
  "done",
  "error",
  "no-claims",
  "interrupted",
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
