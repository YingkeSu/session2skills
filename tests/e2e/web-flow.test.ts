import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  getSeededBrowserFixtureRun,
  seedBrowserFixtureRun,
} from "./fixture-run.js";

const projectDir = process.cwd();
const seededRun = getSeededBrowserFixtureRun();

function pickPort(): number {
  return 50000 + Math.floor(Math.random() * 1000);
}

function waitForStdout(
  child: ChildProcess,
  needle: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      reject(
        new Error(`Timed out waiting for "${needle}" in stdout. Got:\n${buffer}`),
      );
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

async function waitForServer(port: number, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`Server at port ${port} did not become healthy within ${timeoutMs}ms`);
}

async function expectVisibleInViewport(
  page: Page,
  selector: string,
): Promise<void> {
  const isVisible = await page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.bottom > 0
    );
  });
  expect(isVisible).toBe(true);
}

async function runBrowserFlow(page: Page, baseUrl: string): Promise<void> {
  await page.goto(baseUrl);
  await page.getByRole("main", { name: "运行仪表盘" }).waitFor();
  await page.getByText(seededRun.runName).click();

  await page.waitForURL(`**/?run=${seededRun.runName}`);
  await page.getByRole("heading", { name: seededRun.runName }).waitFor();
  await page.getByRole("tab", { name: "审计视图" }).waitFor();
  await page.getByText("Clarify constraints before editing").waitFor();

  await page.getByRole("tab", { name: "报告" }).click();
  await page.getByRole("heading", { name: "质疑报告" }).waitFor();
  await page.getByText("thin-evidence").waitFor();

  await page.getByRole("tab", { name: "预览与追踪" }).click();
  await page.getByRole("heading", { name: "SKILL.md 预览" }).waitFor();
  await page.getByText("Alpha Skill").waitFor();
  await page.getByText("Writer 输出").waitFor();
  await page.getByText("42 tokens").waitFor();

  await page.getByRole("button", { name: "EN" }).click();
  await page.getByRole("tab", { name: "Audit View" }).click();
  await page.getByRole("heading", { name: "Evidence Summary" }).waitFor();
  await page.getByRole("button", { name: /ev-1/ }).click();
  await page
    .locator("#evidence-alpha-run-ev-1")
    .getByText("full evidence text loaded by the expandable evidence panel")
    .waitFor();

  await page.getByRole("button", { name: /Back to runs/ }).click();
  await page.waitForURL("**/");
  await page.getByRole("main", { name: "Runs dashboard" }).waitFor();
  await page.getByText(seededRun.runName).waitFor();
  await expectVisibleInViewport(page, "main");
}

describe("served web UI flow (browser e2e)", () => {
  let tempRoot = "";
  let serverProcess: ChildProcess | null = null;
  let browser: Browser | null = null;
  let port = 0;

  beforeAll(async () => {
    const mainJs = join(projectDir, "dist/cli/main.js");
    if (!existsSync(mainJs)) {
      throw new Error("E2E preflight: dist/cli/main.js not found. Run 'npm run build' first.");
    }
    const webIndex = join(projectDir, "web/dist/index.html");
    if (!existsSync(webIndex)) {
      throw new Error("E2E preflight: web/dist/index.html not found. Run 'npm run build:web' first.");
    }

    tempRoot = await mkdtemp(join(tmpdir(), "s2k-web-flow-e2e-"));
    await seedBrowserFixtureRun({
      runsRoot: join(tempRoot, "generated-skills"),
      runName: seededRun.runName,
    });

    port = pickPort();
    serverProcess = spawn(
      "node",
      ["dist/cli/main.js", "serve", "--directory", tempRoot, "--port", String(port)],
      { cwd: projectDir, stdio: ["ignore", "pipe", "pipe"] },
    );
    await waitForStdout(serverProcess, "Server running", 15000);
    await waitForServer(port);
    browser = await chromium.launch({ headless: true });
  }, 60000);

  afterAll(async () => {
    await browser?.close();
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 300));
      serverProcess.kill("SIGKILL");
    }
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("drives list, detail tabs, language toggle, back navigation, and evidence expansion", async () => {
    if (!browser) throw new Error("Browser was not started");
    const context = await browser.newContext({
      locale: "zh-CN",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    try {
      await runBrowserFlow(page, `http://127.0.0.1:${port}/`);
    } finally {
      await context.close();
    }
  }, 60000);

  test("renders nonblank usable dashboards at desktop and mobile widths", async () => {
    if (!browser) throw new Error("Browser was not started");

    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({
        locale: "zh-CN",
        viewport,
      });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}/`);
      await expect(page.locator("body").innerText()).resolves.toContain(
        seededRun.runName,
      );
      const rootBox = await page.locator("#root").boundingBox();
      expect(rootBox?.width).toBeGreaterThan(0);
      expect(rootBox?.height).toBeGreaterThan(0);
      await context.close();
    }
  }, 60000);
});
