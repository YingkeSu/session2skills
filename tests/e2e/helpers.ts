import { spawn, spawnSync } from "node:child_process";
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

const spawnedPids = new Set<number>();

function getOpenCodeServePids(): Set<number> {
  const result = spawnSync("ps", ["aux"], { encoding: "utf-8" });
  const pids = new Set<number>();
  if (result.status !== 0) return pids;
  for (const line of result.stdout.split("\n")) {
    if (line.includes("opencode serve") && !line.includes("grep")) {
      const pid = parseInt(line.trim().split(/\s+/)[1], 10);
      if (!isNaN(pid)) pids.add(pid);
    }
  }
  return pids;
}

export function runCLI(
  args: string[],
  options?: { env?: Record<string, string>; timeout?: number },
): CliResult {
  const beforePids = getOpenCodeServePids();
  const result = spawnSync("node", ["dist/cli/main.js", ...args], {
    cwd: getProjectDir(),
    env: { ...process.env, ...options?.env },
    timeout: options?.timeout ?? 60000,
    encoding: "utf-8",
  });
  const afterPids = getOpenCodeServePids();
  for (const pid of afterPids) {
    if (!beforePids.has(pid)) spawnedPids.add(pid);
  }

  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export async function runCLIAsync(
  args: string[],
  options?: { env?: Record<string, string>; timeout?: number },
): Promise<CliResult> {
  const beforePids = getOpenCodeServePids();

  return new Promise<CliResult>((resolve) => {
    const child = spawn("node", ["dist/cli/main.js", ...args], {
      cwd: getProjectDir(),
      env: { ...process.env, ...options?.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options?.timeout ?? 60000);

    const forceKillTimeout = setTimeout(() => {
      if (timedOut && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }, (options?.timeout ?? 60000) + 1000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      clearTimeout(forceKillTimeout);
      resolve({ status: 1, stdout, stderr: `${stderr}${error.message}` });
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      clearTimeout(forceKillTimeout);

      const afterPids = getOpenCodeServePids();
      for (const pid of afterPids) {
        if (!beforePids.has(pid)) spawnedPids.add(pid);
      }

      resolve({
        status: timedOut ? null : code,
        stdout,
        stderr: timedOut
          ? `${stderr}Command timed out after ${options?.timeout ?? 60000}ms.`
          : stderr,
      });
    });
  });
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

    // Map SESSION2SKILLS_LLM_* environment variables
    if (key === "SESSION2SKILLS_LLM_BASE_URL") {
      vars["SESSION2SKILLS_LLM_BASE_URL"] = value;
    } else if (key === "SESSION2SKILLS_LLM_API_KEY") {
      vars["SESSION2SKILLS_LLM_API_KEY"] = value;
    } else if (key === "SESSION2SKILLS_LLM_MODEL") {
      vars["SESSION2SKILLS_LLM_MODEL"] = value;
    } else if (key === "SESSION2SKILLS_LLM_PROVIDER") {
      vars["SESSION2SKILLS_LLM_PROVIDER"] = value;
    } else if (key === "Zhipu_coding_plan_BaseUrl") {
      vars["SESSION2SKILLS_LLM_BASE_URL"] = value;
    } else if (key === "Zhipu_coding_plan_apikey") {
      vars["SESSION2SKILLS_LLM_API_KEY"] = value;
    }
  }

  // Set defaults if not already set
  if (!vars["SESSION2SKILLS_LLM_MODEL"]) {
    vars["SESSION2SKILLS_LLM_MODEL"] = process.env.SESSION2SKILLS_LLM_MODEL || "glm-4.7";
  }
  if (!vars["SESSION2SKILLS_LLM_PROVIDER"]) {
    vars["SESSION2SKILLS_LLM_PROVIDER"] = process.env.SESSION2SKILLS_LLM_PROVIDER || "zhipuai";
  }

  return vars;
}

export function getHybridEnv(): Record<string, string> {
  return loadDotEnv();
}

export function killOrphanedOpenCodeServers(): void {
  for (const pid of spawnedPids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already dead
    }
  }
  spawnedPids.clear();
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
  if (cliResult.status !== 0) {
    throw new Error(
      `E2E preflight: inspect command failed with exit code ${cliResult.status}. stderr: ${cliResult.stderr.trim()}`,
    );
  }
  if (cliResult.stdout.includes("No OpenCode sessions found")) {
    throw new Error(
      "E2E preflight: No OpenCode sessions found in project. E2E tests require session data.",
    );
  }
}
