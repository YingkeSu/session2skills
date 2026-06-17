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
};
