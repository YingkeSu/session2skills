/**
 * Electron smoke test — launches the packaged app, verifies the Hono server
 * responds on localhost, then kills the process.
 *
 * Usage: node scripts/electron-smoke-test.mjs [--app-path <path>]
 *
 * This is a manual smoke test. It requires a display (or Xvfb on Linux)
 * and cannot easily run in headless CI without a virtual framebuffer.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Parse --app-path argument
const appPathArg = process.argv.indexOf("--app-path");
const defaultMacPath = join(ROOT, "release", "mac-arm64", "session2skills.app", "Contents", "MacOS", "session2skills");
const defaultMacIntelPath = join(ROOT, "release", "mac", "session2skills.app", "Contents", "MacOS", "session2skills");

let appPath;
if (appPathArg !== -1 && process.argv[appPathArg + 1]) {
  appPath = process.argv[appPathArg + 1];
} else if (existsSync(defaultMacPath)) {
  appPath = defaultMacPath;
} else if (existsSync(defaultMacIntelPath)) {
  appPath = defaultMacIntelPath;
} else {
  console.error("Could not find packaged Electron app.");
  console.error("Expected at:");
  console.error(`  ${defaultMacPath}`);
  console.error(`  ${defaultMacIntelPath}`);
  console.error("");
  console.error("Run 'npm run electron:build' first, or pass --app-path <path>.");
  process.exit(1);
}

console.log(`Smoke test: launching ${appPath}`);

const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_INTERVAL_MS = 500;

const child = spawn(appPath, [], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
});

let stdout = "";
let stderr = "";

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  stdout += text;
  process.stdout.write(text);
});

child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  stderr += text;
  process.stderr.write(text);
});

function killApp() {
  if (!child.killed) {
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }, 3000);
  }
}

// Extract port from stdout: "Electron server running at http://localhost:<port>"
function extractPort(): number | null {
  const match = stdout.match(/Electron server running at http:\/\/localhost:(\d+)/);
  return match ? parseInt(match[1]!, 10) : null;
}

async function pollHealth(port: number): Promise<boolean> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`);
      if (res.ok) {
        console.log(`\n✅ Health check passed on port ${port}`);
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
  }
  return false;
}

async function run(): Promise<void> {
  // Wait for the server to start and poll health
  const startTime = Date.now();

  const portFound = await new Promise<boolean>((resolve) => {
    const checkInterval = setInterval(() => {
      const port = extractPort();
      if (port) {
        clearInterval(checkInterval);
        resolve(true);
      }
      if (Date.now() - startTime > HEALTH_TIMEOUT_MS) {
        clearInterval(checkInterval);
        resolve(false);
      }
    }, HEALTH_POLL_INTERVAL_MS);
  });

  if (!portFound) {
    console.error("\n❌ Failed to detect server port within timeout.");
    killApp();
    process.exit(1);
  }

  const port = extractPort()!;
  const healthy = await pollHealth(port);

  killApp();

  if (!healthy) {
    console.error(`\n❌ Health check failed on port ${port}`);
    process.exit(1);
  }

  console.log("✅ Smoke test passed");
}

child.on("error", (err) => {
  console.error(`\n❌ Failed to launch app: ${err.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal === "SIGTERM" || signal === "SIGKILL") {
    // Expected from killApp()
    return;
  }
  if (code !== null && code !== 0) {
    console.error(`\n❌ App exited with code ${code}`);
    process.exit(1);
  }
});

run().catch((err) => {
  console.error(`\n❌ Smoke test error: ${err}`);
  killApp();
  process.exit(1);
});
