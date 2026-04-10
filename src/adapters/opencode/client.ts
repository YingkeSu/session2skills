import { spawn } from "node:child_process";

import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2";

export type OpenCodeConnectionOptions = {
  directory: string;
  workspace?: string;
};

export type OpenCodeClientHandle = {
  client: OpencodeClient;
  close: () => Promise<void>;
};

export async function createTypedOpenCodeClient(
  options: OpenCodeConnectionOptions,
): Promise<OpenCodeClientHandle> {
  const server = await startOpenCodeServer();
  const client = createOpencodeClient({
    baseUrl: server.url,
    directory: options.directory,
    experimental_workspaceID: options.workspace,
  });

  return {
    client,
    close: server.close,
  };
}

async function startOpenCodeServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const port = 10000 + Math.floor(Math.random() * 40000);
  const proc = spawn("opencode", ["serve", "--hostname=127.0.0.1", `--port=${port}`], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const url = await waitForServerUrl(proc);

  return {
    url,
    close: () => stopProcess(proc),
  };
}

async function waitForServerUrl(proc: ReturnType<typeof spawn>): Promise<string> {
  let output = "";

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      void stopProcess(proc).finally(() => {
        reject(new Error("Timeout waiting for OpenCode server to start."));
      });
    }, 10000);

    const onStdout = (chunk: Buffer): void => {
      output += chunk.toString();

      for (const line of output.split("\n")) {
        if (!line.startsWith("opencode server listening")) {
          continue;
        }

        const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
        if (!match) {
          cleanup();
          void stopProcess(proc).finally(() => {
            reject(new Error(`Failed to parse server url from output: ${line}`));
          });
          return;
        }

        cleanup();
        resolve(match[1]);
        return;
      }
    };

    const onStderr = (chunk: Buffer): void => {
      output += chunk.toString();
    };

    const onExit = (code: number | null): void => {
      cleanup();
      reject(new Error(`OpenCode server exited before startup (code: ${code ?? "unknown"}). Output: ${output}`));
    };

    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    const cleanup = (): void => {
      clearTimeout(timeout);
      proc.stdout?.off("data", onStdout);
      proc.stderr?.off("data", onStderr);
      proc.off("exit", onExit);
      proc.off("error", onError);
    };

    proc.stdout?.on("data", onStdout);
    proc.stderr?.on("data", onStderr);
    proc.on("exit", onExit);
    proc.on("error", onError);
  });
}

async function stopProcess(proc: ReturnType<typeof spawn>): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) {
    return;
  }

  proc.kill();

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (proc.exitCode === null && proc.signalCode === null) {
        proc.kill("SIGKILL");
      }
    }, 1000);

    proc.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

export function toSessionQuery(options: OpenCodeConnectionOptions): {
  directory: string;
  workspace?: string;
} {
  return options.workspace
    ? { directory: options.directory, workspace: options.workspace }
    : { directory: options.directory };
}
