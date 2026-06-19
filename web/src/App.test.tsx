// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  App,
  buildSelectedRunUrl,
  resolveSelectedRunFromLocation,
  RunsDashboard,
} from "./App.js";
import { LocaleProvider } from "./i18n/LocaleContext.js";
import { withQueryClient } from "./test-utils.js";
import type { RunSummary } from "./runs.js";

const runs: RunSummary[] = [
  {
    name: "writer-pass",
    model: "gpt-5",
    generatedAt: "2026-05-20T10:00:00Z",
    verifierPassed: true,
    claimCount: 12,
    skepticScore: 0.92,
    skepticIssueCount: 1,
    artifactStatus: "complete",
    skillAvailable: true,
    summaryAvailable: true,
  },
  {
    name: "skeptic-needs-review",
    model: "gpt-5-mini",
    generatedAt: "2026-05-21T10:00:00Z",
    verifierPassed: false,
    claimCount: 8,
    skepticScore: 0.58,
    skepticIssueCount: 3,
    artifactStatus: "legacy",
    skillAvailable: true,
    summaryAvailable: false,
  },
];

const storage = new Map<string, string>();

Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
    removeItem(key: string) {
      storage.delete(key);
    },
    clear() {
      storage.clear();
    },
  },
  configurable: true,
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  globalThis.localStorage?.clear();
});

describe("RunsDashboard", () => {
  it("renders compact summary metrics derived from the run list", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <RunsDashboard runs={runs} onSelect={() => undefined} />
      </LocaleProvider>,
    );

    expect(html).toContain("2");
    expect(html).toContain("1");
    expect(html).toContain("4");
    expect(html).toContain("0.75");
    expect(html).toContain("skeptic-needs-review");
  });

  it("renders generation controls and artifact management status", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <RunsDashboard
          runs={runs}
          generateState={{ status: "idle" }}
          onGenerate={() => undefined}
          onSelect={() => undefined}
        />
      </LocaleProvider>,
    );

    expect(html).toContain("生成技能");
    expect(html).toContain("最近会话");
    expect(html).toContain("完整");
    expect(html).toContain("旧版");
    expect(html).toContain("SKILL.md");
    expect(html).toContain("无 summary");
  });

  it("submits generation settings to the runs API", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    let progressCallCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });

        if (url === "/api/runs" && init?.method === "POST") {
          return jsonResponse({
            name: "new-web-skill",
            status: "running",
          });
        }

        if (url === "/api/runs/new-web-skill/progress") {
          progressCallCount += 1;
          if (progressCallCount <= 1) {
            return jsonResponse({
              stage: "analyst",
              completedStages: [],
              startedAt: "2026-06-18T09:00:00.000Z",
              updatedAt: "2026-06-18T09:00:01.000Z",
            });
          }
          return jsonResponse({
            stage: "done",
            completedStages: ["analyst", "skeptic", "writer", "verifier"],
            startedAt: "2026-06-18T09:00:00.000Z",
            updatedAt: "2026-06-18T09:00:05.000Z",
          });
        }

        return jsonResponse(runs);
      }),
    );

    globalThis.localStorage?.setItem("session2skills-locale", "en");
    const container = document.createElement("div");
    document.body.append(container);
    await React.act(async () => {
      createRoot(container).render(
        withQueryClient(
          <LocaleProvider>
            <App />
          </LocaleProvider>,
        ),
      );
    });

    await screenText("Generate Skill");
    await React.act(async () => {
      setInputValue(inputByLabel("Run name"), "new-web-skill");
      setInputValue(inputByLabel("Recent sessions"), "3");
      setSelectValue(selectByLabel("Tone"), "detailed");
      inputByLabel("Overwrite existing output").click();
      buttonByText("Generate").click();
    });

    await React.act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    await screenText("Generated new-web-skill");
    const postRequest = requests.find(
      (request) => request.url === "/api/runs" && request.init?.method === "POST",
    );
    expect(postRequest?.init?.body).toBe(
      JSON.stringify({
        name: "new-web-skill",
        recent: 3,
        tone: "detailed",
        template: "claude-skill",
        skillType: "workflow",
        force: true,
        evidenceConfig: { tokenBudget: 160000, maxChars: 5000, maxItems: 3000 },
        async: true,
      }),
    );
    vi.useRealTimers();
  });
});

describe("run URL state", () => {
  it("reads the selected run from either query or hash URL state", () => {
    expect(
      resolveSelectedRunFromLocation(
        new URL("https://example.test/?run=skeptic-needs-review"),
      ),
    ).toBe("skeptic-needs-review");

    expect(
      resolveSelectedRunFromLocation(
        new URL("https://example.test/#run=writer-pass"),
      ),
    ).toBe("writer-pass");
  });

  it("writes the selected run into the query string and removes it when returning to the list", () => {
    expect(
      buildSelectedRunUrl(
        {
          pathname: "/runs",
          search: "?page=2",
        },
        "skeptic-needs-review",
      ),
    ).toBe("/runs?page=2&run=skeptic-needs-review");

    expect(
      buildSelectedRunUrl(
        {
          pathname: "/runs",
          search: "?page=2&run=skeptic-needs-review",
        },
        null,
      ),
    ).toBe("/runs?page=2");
  });
});

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function inputByLabel(label: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`,
  );
  if (!input) {
    throw new Error(`Input not found: ${label}`);
  }
  return input;
}

function selectByLabel(label: string): HTMLSelectElement {
  const select = document.querySelector<HTMLSelectElement>(
    `select[aria-label="${label}"]`,
  );
  if (!select) {
    throw new Error(`Select not found: ${label}`);
  }
  return select;
}

function buttonByText(text: string): HTMLButtonElement {
  const buttons = Array.from(document.querySelectorAll("button"));
  const button = buttons.find((candidate) => candidate.textContent === text);
  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }
  return button;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  );
  descriptor?.set?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

async function screenText(text: string): Promise<string> {
  for (let i = 0; i < 20; i += 1) {
    if (document.body.textContent?.includes(text)) return text;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Text not found: ${text}`);
}
