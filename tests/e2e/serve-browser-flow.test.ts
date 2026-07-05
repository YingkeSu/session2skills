import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { seedServeRunFixture } from "./serve-fixture.js";
import { pickPort, waitForServer, waitForStdout } from "./serve-helpers.js";

const projectDir = process.cwd();

type ViewportCase = {
  name: string;
  width: number;
  height: number;
};

const viewportCases: ViewportCase[] = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

async function expectVisibleInViewport(page: Page, selector: string): Promise<void> {
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
  await page.getByTestId("run-dashboard").waitFor();
  await page.getByRole("button", { name: /alpha-run/ }).click();

  await page.getByRole("heading", { name: "alpha-run" }).waitFor();
  await page.getByTestId("claims-tab").click();
  await page.getByText("Clarify constraints before editing").waitFor();

  await page.getByTestId("reports-tab").click();
  await page.getByRole("heading", { name: "质疑报告" }).waitFor();
  await page.getByText("thin-evidence").waitFor();

  await page.getByTestId("preview-tab").click();
  await page.getByRole("heading", { name: "SKILL.md 预览" }).waitFor();
  await page.getByText("Alpha Skill").waitFor();
  // Scope to the preview panel: the always-visible DAG strip (#32) also renders
  // a "撰写" (writer) stage node in the header, which would otherwise make this
  // text selector ambiguous under Playwright strict mode.
  await page.locator("#run-detail-panel-preview").getByText("撰写").waitFor();

  await page.getByRole("button", { name: "EN" }).click();
  await page.getByRole("tab", { name: "Claims & Evidence" }).click();
  await page.getByRole("heading", { name: "Evidence Summary" }).waitFor();
  await page.getByRole("button", { name: /ev-1/ }).click();
  await page
    .locator("#evidence-alpha-run-ev-1")
    .getByText("full evidence text loaded by the expandable evidence panel")
    .waitFor();

  await page.getByRole("button", { name: /Back to runs/ }).click();
  await page.getByTestId("run-dashboard").waitFor();
  await page.getByRole("button", { name: /alpha-run/ }).waitFor();
  await expectVisibleInViewport(page, "main");
}

describe("serve command browser flow (e2e)", () => {
  let tempRoot: string;
  let serverProcess: ChildProcess | null = null;
  let browser: Browser | null = null;
  let port: number;
  let shouldSkip = false;

  beforeAll(async () => {
    const mainJs = join(projectDir, "dist/cli/main.js");
    if (!existsSync(mainJs)) {
      throw new Error("E2E preflight: dist/cli/main.js not found. Run 'npm run build' first.");
    }
    const webIndex = join(projectDir, "web/dist/index.html");
    if (!existsSync(webIndex)) {
      throw new Error("E2E preflight: web/dist/index.html not found. Run 'npm run build:web' first.");
    }

    tempRoot = await mkdtemp(join(tmpdir(), "s2k-serve-browser-e2e-"));
    port = pickPort(50000);
    await seedServeRunFixture(tempRoot);

    serverProcess = spawn(
      "node",
      ["dist/cli/main.js", "serve", "--directory", tempRoot, "--port", String(port)],
      { cwd: projectDir, stdio: ["ignore", "pipe", "pipe"] },
    );
    await waitForStdout(serverProcess, "Server running", 15000);
    await waitForServer(port);

    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      shouldSkip = true;
    }
  }, 60000);

  afterAll(async () => {
    await browser?.close();
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 500));
      serverProcess.kill("SIGKILL");
    }
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test.each(viewportCases)(
    "drives the optimized SPA flow in $name viewport",
    async ({ width, height }) => {
      if (shouldSkip) return;
      if (!browser) {
        throw new Error("Browser was not started");
      }

      const context = await browser.newContext({
        viewport: { width, height },
        locale: "zh-CN",
      });
      const page = await context.newPage();

      try {
        await runBrowserFlow(page, `http://127.0.0.1:${port}/`);
      } finally {
        await context.close();
      }
    },
    60000,
  );
});
