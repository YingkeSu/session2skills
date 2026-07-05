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
  it("renders the master list and selects the first run by default", () => {
    renderDashboard([makeRun({ name: "alpha" })]);

    expect(screen.getByTestId("run-dashboard")).toBeTruthy();
    // alpha appears as a keyboard-activatable button in the run rail.
    expect(
      screen.getByRole("button", { name: /alpha/ }),
    ).toBeTruthy();
    expect(screen.getByTestId("run-detail-pane")).toBeTruthy();
    // A run is selected by default — the detail pane shows it, not the empty
    // placeholder.
    expect(screen.getByTestId("run-detail-selected")).toBeTruthy();
    expect(screen.getByTestId("run-detail-selected").textContent).toContain(
      "alpha",
    );
    expect(screen.queryByTestId("run-detail-empty")).toBeNull();
  });

  it("moves the selection when a different run row is chosen", () => {
    renderDashboard([makeRun({ name: "alpha" }), makeRun({ name: "beta" })]);

    // Default selection is the first run.
    expect(screen.getByTestId("run-detail-selected").textContent).toContain(
      "alpha",
    );

    fireEvent.click(screen.getByRole("button", { name: /beta/ }));
    expect(screen.getByTestId("run-detail-selected").textContent).toContain(
      "beta",
    );
    expect(
      screen.getByTestId("run-detail-selected").textContent,
    ).not.toContain("alpha");
  });

  it("marks the selected run as current and moves the marker on selection", () => {
    renderDashboard([makeRun({ name: "alpha" }), makeRun({ name: "beta" })]);

    const alphaButton = screen.getByRole("button", { name: /alpha/ });
    const betaButton = screen.getByRole("button", { name: /beta/ });

    // Default-selected run carries the current marker.
    expect(alphaButton.getAttribute("aria-current")).toBe("true");
    expect(betaButton.getAttribute("aria-current")).toBeNull();

    fireEvent.click(betaButton);
    expect(betaButton.getAttribute("aria-current")).toBe("true");
    expect(alphaButton.getAttribute("aria-current")).toBeNull();
  });

  it("renders each run as a keyboard-activatable button", () => {
    renderDashboard([makeRun({ name: "alpha" }), makeRun({ name: "beta" })]);

    const alphaButton = screen.getByRole("button", { name: /alpha/ });
    expect(alphaButton.tagName).toBe("BUTTON");
  });
});
