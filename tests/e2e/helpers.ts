import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export function getProjectDir(): string {
  return process.cwd();
}

export function createTempDir(prefix?: string): string {
  return mkdtempSync(join(tmpdir(), prefix ?? "session2skills-e2e-"));
}

export function cleanupDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

export function readArtifact<T>(dir: string, filename: string): T {
  const raw = readFileSync(join(dir, filename), "utf-8");
  return JSON.parse(raw) as T;
}

export interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export function runCLI(
  args: string[],
  options?: { env?: Record<string, string>; timeout?: number },
): CliResult {
  const result = spawnSync("node", ["dist/cli/main.js", ...args], {
    cwd: getProjectDir(),
    env: { ...process.env, ...options?.env },
    timeout: options?.timeout ?? 60000,
    encoding: "utf-8",
  });

  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

export function loadDotEnv(): Record<string, string> {
  const envPath = join(getProjectDir(), ".env");
  const raw = readFileSync(envPath, "utf-8");

  const vars: Record<string, string> = {};

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const value = stripQuotes(trimmed.slice(eqIdx + 1).trim());

    if (key === "Zhipu_coding_plan_BaseUrl") {
      vars["SESSION2SKILLS_LLM_BASE_URL"] = value;
    } else if (key === "Zhipu_coding_plan_apikey") {
      vars["SESSION2SKILLS_LLM_API_KEY"] = value;
    }
  }

  vars["SESSION2SKILLS_LLM_MODEL"] = "glm-4.7";
  vars["SESSION2SKILLS_LLM_PROVIDER"] = "zhipuai";

  return vars;
}

export function getHybridEnv(): Record<string, string> {
  return loadDotEnv();
}

export function killOrphanedOpenCodeServers(): void {
  const result = spawnSync("pkill", ["-f", "opencode serve"], { encoding: "utf-8" });
  if (result.status !== 0 && result.status !== null) {
    console.log("killOrphanedOpenCodeServers: no matching processes (this is fine)");
  } else {
    console.log("killOrphanedOpenCodeServers: cleaned up orphaned processes");
  }
}

export function preflightChecks(): void {
  const whichResult = spawnSync("which", ["opencode"], { encoding: "utf-8" });
  if (whichResult.status !== 0) {
    throw new Error("E2E preflight: 'opencode' not found on PATH. Skipping all E2E tests.");
  }

  const mainJs = join(getProjectDir(), "dist/cli/main.js");
  if (!existsSync(mainJs)) {
    throw new Error(
      "E2E preflight: dist/cli/main.js not found. Run 'npm run build' before E2E tests.",
    );
  }

  const cliResult = runCLI(["inspect", "-d", getProjectDir(), "--recent", "1"]);
  if (cliResult.stdout.includes("No OpenCode sessions found")) {
    throw new Error(
      "E2E preflight: No OpenCode sessions found in project. E2E tests require session data.",
    );
  }
}
