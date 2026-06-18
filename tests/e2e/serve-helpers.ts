import type { ChildProcess } from "node:child_process";

/**
 * Wait for a specific string to appear in a child process's stdout.
 *
 * @param child - The spawned child process to monitor
 * @param needle - The string to search for in stdout output
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @returns The accumulated stdout buffer up to and including the needle
 * @throws {Error} If the timeout is reached or the process exits early
 */
export function waitForStdout(
  child: ChildProcess,
  needle: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for "${needle}" in stdout. Got:\n${buffer}`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      if (buffer.includes(needle)) {
        clearTimeout(timer);
        resolve(buffer);
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited early with code ${code}. stdout:\n${buffer}`));
    });
  });
}

/**
 * Wait for a server's health endpoint to respond with HTTP 200.
 *
 * @param port - The port number to check
 * @param timeoutMs - Maximum time to wait in milliseconds (default: 10000)
 * @throws {Error} If the server does not become healthy within the timeout
 */
export async function waitForServer(port: number, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`Server at port ${port} did not become healthy within ${timeoutMs}ms`);
}

/**
 * Pick a random port number from a specified range.
 *
 * @param start - Start of the port range (default: 49000)
 * @param size - Number of ports in the range (default: 1000)
 * @returns A random port number within [start, start + size)
 */
export function pickPort(start = 49000, size = 1000): number {
  return start + Math.floor(Math.random() * size);
}
