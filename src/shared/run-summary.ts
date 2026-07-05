import type { GenerationStage } from "../generate/progress.js";

export type RunSummary = {
  name: string;
  model: string;
  generatedAt: string;
  verifierPassed: boolean;
  claimCount: number;
  skepticScore: number;
  skepticIssueCount: number;
  artifactStatus: "complete" | "partial" | "legacy";
  skillAvailable: boolean;
  summaryAvailable: boolean;
  progressStage?: GenerationStage;
  /** Skill-run management fields, sourced from `.skill-meta.json`. */
  group?: string | null;
  archived?: boolean;
  archivedAt?: string | null;
  updatedAt?: string;
};
