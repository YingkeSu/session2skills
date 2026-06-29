// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RunsDashboard } from "../App.js";
import { LocaleProvider } from "../i18n/LocaleContext.js";
import type { RunSummary } from "../runs.js";

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
  document.body.replaceChildren();
  storage.clear();
});

// RunsDashboard renders a master-detail split: the runs table on the left,
// a detail pane on the right that shows the selected run.
function makeRun(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    name: "run-2024-01-01",
    model: "gpt-4.1",
    generatedAt: "2024-01-01T00:00:00.000Z",
    verifierPassed: true,
    claimCount: 3,
    skepticScore: 0.82,
    skepticIssueCount: 0,
    skillAvailable: true,
    summaryAvailable: true,
    progressStage: "done",
    ...overrides,
  };
}

function renderDashboard(runs: RunSummary[]): void {
  storage.set("session2skills-locale", "en");
  render(
    <LocaleProvider>
      <RunsDashboard runs={runs} onSelect={() => undefined} />
    </LocaleProvider>,
  );
}

describe("RunsDashboard master-detail layout", () => {
  it("renders a master list and an empty detail placeholder before any selection", () => {
    renderDashboard([makeRun({ name: "alpha" })]);

    expect(screen.getByTestId("run-dashboard")).toBeTruthy();
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.getByTestId("run-detail-pane")).toBeTruthy();
    expect(screen.getByTestId("run-detail-empty")).toBeTruthy();
  });

  it("shows the selected run's detail when a row is chosen, and swaps on a new selection", () => {
    renderDashboard([makeRun({ name: "alpha" }), makeRun({ name: "beta" })]);

    expect(screen.queryByTestId("run-detail-selected")).toBeNull();

    fireEvent.click(screen.getByText("alpha"));
    const detail = screen.getByTestId("run-detail-selected");
    expect(detail.textContent).toContain("alpha");

    fireEvent.click(screen.getByText("beta"));
    expect(screen.getByTestId("run-detail-selected").textContent).toContain(
      "beta",
    );
    expect(
      screen.getByTestId("run-detail-selected").textContent,
    ).not.toContain("alpha");
  });
});
