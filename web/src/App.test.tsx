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

// Runs carrying skill-management metadata (group / archived) for the
// management toolbar + inline-edit coverage.
const managedRuns: RunSummary[] = [
  {
    name: "grouped-run",
    model: "gpt-5",
    generatedAt: "2026-05-20T10:00:00Z",
    verifierPassed: true,
    claimCount: 5,
    skepticScore: 0.9,
    skepticIssueCount: 0,
    artifactStatus: "complete",
    skillAvailable: true,
    summaryAvailable: true,
    group: "frontend",
    archived: false,
  },
  {
    name: "archived-run",
    model: "gpt-5",
    generatedAt: "2026-05-22T10:00:00Z",
    verifierPassed: false,
    claimCount: 3,
    skepticScore: 0.4,
    skepticIssueCount: 2,
    artifactStatus: "legacy",
    skillAvailable: true,
    summaryAvailable: false,
    group: "backend",
    archived: true,
    archivedAt: "2026-05-23T10:00:00Z",
  },
  {
    name: "ungrouped-run",
    model: "gpt-5",
    generatedAt: "2026-05-24T10:00:00Z",
    verifierPassed: true,
    claimCount: 2,
    skepticScore: 0.8,
    skepticIssueCount: 0,
    artifactStatus: "complete",
    skillAvailable: true,
    summaryAvailable: true,
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
          showGeneratePanel={true}
          onGenerate={() => undefined}
          onSelect={() => undefined}
        />
      </LocaleProvider>,
    );

    expect(html).toContain("生成技能");
    expect(html).toContain("最近会话");
    // Each run surfaces its artifact status as a compact pill in the rail.
    expect(html).toContain("完整");
    expect(html).toContain("旧版");
    // The default-selected run's full artifact detail (skill/summary) appears
    // in the preview pane.
    expect(html).toContain("SKILL.md");
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

    await screenText("New Run");
    await React.act(async () => {
      buttonByText("New Run").click();
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

  it("forwards llmConfig when the provider section is filled", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    let progressCallCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });

        if (url === "/api/runs" && init?.method === "POST") {
          return jsonResponse({ name: "llm-run", status: "running" });
        }

        if (url === "/api/runs/llm-run/progress") {
          progressCallCount += 1;
          if (progressCallCount <= 1) {
            return jsonResponse({
              stage: "analyst",
              completedStages: [],
              startedAt: "2026-07-06T09:00:00.000Z",
              updatedAt: "2026-07-06T09:00:01.000Z",
            });
          }
          return jsonResponse({
            stage: "done",
            completedStages: ["analyst", "skeptic", "writer", "verifier"],
            startedAt: "2026-07-06T09:00:00.000Z",
            updatedAt: "2026-07-06T09:00:05.000Z",
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

    await screenText("New Run");
    await React.act(async () => {
      buttonByText("New Run").click();
    });
    await screenText("Generate Skill");

    // Open the collapsible LLM provider section.
    await React.act(async () => {
      buttonByTextIncludes("LLM Provider").click();
    });

    await React.act(async () => {
      setSelectValue(selectByLabel("Preset"), "openai");
      setInputValue(inputByLabel("Model"), "gpt-4o");
      setInputValue(inputByLabel("API key (optional)"), "sk-test");
      setInputValue(inputByLabel("Run name"), "llm-run");
      buttonByText("Generate").click();
    });

    await React.act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    await screenText("Generated llm-run");
    const postRequest = requests.find(
      (request) => request.url === "/api/runs" && request.init?.method === "POST",
    );
    expect(postRequest?.init?.body).toBeTruthy();
    const body = JSON.parse(String(postRequest?.init?.body)) as {
      llmConfig?: Record<string, string>;
    };
    expect(body.llmConfig).toEqual({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
      apiKey: "sk-test",
    });
    vi.useRealTimers();
  });
});

describe("skill management", () => {
  it("keeps management controls available when the default runs list is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([])),
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

    await screenText("Show archived");
    expect(document.body.textContent).toContain("New Run");
    expect(document.body.textContent).toContain("0 runs");
  });

  it("renders the management toolbar and compact group/archived status", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <RunsDashboard
          runs={managedRuns}
          onSelect={() => undefined}
          management={{
            onUpdateGroup: () => undefined,
            onToggleArchived: () => undefined,
            onDelete: () => undefined,
            metaPending: false,
            deletePending: false,
            errorMessage: null,
          }}
        />
      </LocaleProvider>,
    );

    // Toolbar: group filter + archive visibility toggle.
    expect(html).toContain("全部分组");
    expect(html).toContain("未分组");
    expect(html).toContain("显示已归档");
    // Compact status chips in the rail.
    expect(html).toContain("frontend");
    expect(html).toContain("backend");
    expect(html).toContain("已归档");
    // Inline group edit + per-run actions for the default-selected run.
    expect(html).toContain("保存分组");
    expect(html).toContain("归档");
    expect(html).toContain("删除");
    expect(html).toContain('data-testid="run-management"');
  });

  it("saves inline group edits via PATCH /api/runs/:name/meta", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });

        if (
          url === "/api/runs/grouped-run/meta" &&
          init?.method === "PATCH"
        ) {
          return jsonResponse({ ...managedRuns[0], group: "frontend-renamed" });
        }
        return jsonResponse(managedRuns);
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

    await screenText("Save group");
    await React.act(async () => {
      setInputValue(inputById("run-group-edit"), "frontend-renamed");
    });
    await React.act(async () => {
      buttonByText("Save group").click();
    });
    await waitUntil(() =>
      requests.some(
        (r) => r.url === "/api/runs/grouped-run/meta" && r.init?.method === "PATCH",
      ),
    );

    const patch = requests.find(
      (r) => r.url === "/api/runs/grouped-run/meta" && r.init?.method === "PATCH",
    );
    expect(patch?.init?.body).toBe(JSON.stringify({ group: "frontend-renamed" }));
  });

  it("shows management errors when a meta update fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (
          url === "/api/runs/grouped-run/meta" &&
          init?.method === "PATCH"
        ) {
          return jsonResponse({ error: "boom" }, 500);
        }
        return jsonResponse(managedRuns);
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

    await screenText("Save group");
    await React.act(async () => {
      setInputValue(inputById("run-group-edit"), "frontend-renamed");
    });
    await React.act(async () => {
      buttonByText("Save group").click();
    });

    await screenText("Management action failed");
  });

  it("resets a dangling group filter after archiving the only run in that group", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    let frontendArchived = false;
    const getRuns = (): RunSummary[] =>
      frontendArchived
        ? [managedRuns[2]!]
        : [managedRuns[0]!, managedRuns[2]!];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        if (
          url === "/api/runs/grouped-run/meta" &&
          init?.method === "PATCH"
        ) {
          frontendArchived = true;
          return jsonResponse({ ...managedRuns[0], archived: true });
        }
        return jsonResponse(getRuns());
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

    await screenText("grouped-run");
    await React.act(async () => {
      setSelectValue(selectByLabel("Group filter"), "frontend");
    });
    expect(document.body.textContent).not.toContain("ungrouped-run");

    await React.act(async () => {
      buttonByText("Archive").click();
    });

    await screenText("ungrouped-run");
    expect(selectByLabel("Group filter").value).toBe("");
    expect(
      requests.some(
        (r) => r.url === "/api/runs/grouped-run/meta" && r.init?.method === "PATCH",
      ),
    ).toBe(true);
  });

  it("deletes the selected run after window.confirm", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });

        if (url === "/api/runs/grouped-run" && init?.method === "DELETE") {
          return jsonResponse({ deleted: true, name: "grouped-run" });
        }
        return jsonResponse(managedRuns);
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

    await screenText("Delete");
    await React.act(async () => {
      buttonByText("Delete").click();
    });
    await waitUntil(() =>
      requests.some(
        (r) => r.url === "/api/runs/grouped-run" && r.init?.method === "DELETE",
      ),
    );

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("grouped-run"));
    confirmSpy.mockRestore();
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

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
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

function inputById(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`Input not found: ${id}`);
  }
  return el;
}

async function waitUntil(
  condition: () => boolean,
  { tries = 50, step = 10 } = {},
): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, step));
  }
  throw new Error("Condition was never met");
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

function buttonByTextIncludes(text: string): HTMLButtonElement {
  const buttons = Array.from(document.querySelectorAll("button"));
  const button = buttons.find((candidate) => (candidate.textContent ?? "").includes(text));
  if (!button) {
    throw new Error(`Button not found containing: ${text}`);
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
