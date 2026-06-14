export type RunSummary = {
  name: string;
  model: string;
  generatedAt: string;
  verifierPassed: boolean;
  claimCount: number;
  skepticScore: number;
  skepticIssueCount: number;
};

export async function fetchRuns(): Promise<RunSummary[]> {
  const res = await fetch("/api/runs");
  if (!res.ok) {
    throw new Error(`Failed to fetch runs: ${res.status}`);
  }
  return res.json();
}
