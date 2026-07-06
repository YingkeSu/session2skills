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

  it("narrows the run list by search text across name and model", () => {
    renderDashboard([
      makeRun({ name: "alpha", model: "gpt-4.1" }),
      makeRun({ name: "beta", model: "claude-sonnet" }),
      makeRun({ name: "gamma", model: "gpt-4.1" }),
    ]);

    const list = () => document.querySelector(".run-list")!;
    expect(list().textContent).toContain("alpha");
    expect(list().textContent).toContain("beta");

    fireEvent.change(screen.getByTestId("runs-search-input"), {
      target: { value: "bet" },
    });
    expect(list().textContent).not.toContain("alpha");
    expect(list().textContent).toContain("beta");
    expect(list().textContent).not.toContain("gamma");

    // Search also matches model strings.
    fireEvent.change(screen.getByTestId("runs-search-input"), {
      target: { value: "claude" },
    });
    expect(list().textContent).not.toContain("alpha");
    expect(list().textContent).toContain("beta");
  });

  it("narrows the run list by verifier pass/fail and by model", () => {
    renderDashboard([
      makeRun({ name: "alpha", model: "gpt-4.1", verifierPassed: true }),
      makeRun({ name: "beta", model: "claude", verifierPassed: false }),
    ]);

    const list = () => document.querySelector(".run-list")!;

    fireEvent.change(screen.getByTestId("runs-verifier-filter"), {
      target: { value: "fail" },
    });
    expect(list().textContent).not.toContain("alpha");
    expect(list().textContent).toContain("beta");

    // Reset verifier, then filter by model.
    fireEvent.change(screen.getByTestId("runs-verifier-filter"), {
      target: { value: "all" },
    });
    fireEvent.change(screen.getByTestId("runs-model-filter"), {
      target: { value: "claude" },
    });
    expect(list().textContent).not.toContain("alpha");
    expect(list().textContent).toContain("beta");
  });
});
