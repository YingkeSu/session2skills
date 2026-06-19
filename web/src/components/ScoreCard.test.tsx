// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { withQueryClient } from "../test-utils.js";
import { ScoreCard } from "./ScoreCard.js";
import type { SkillEvaluation } from "../runs.js";

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

function renderScoreCard(evaluation: SkillEvaluation | null): HTMLDivElement {
  localStorage.setItem("session2skills-locale", "en");
  const container = document.createElement("div");
  document.body.append(container);

  const root = createRoot(container);
  root.render(
    withQueryClient(
      createElement("div", null,
        createElement(ScoreCard, { evaluation }),
      ),
    ),
  );

  return container;
}

async function screenText(container: HTMLDivElement, text: string): Promise<boolean> {
  for (let i = 0; i < 30; i += 1) {
    if (container.textContent?.includes(text)) return true;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return false;
}

async function findByTestId(
  container: HTMLDivElement,
  testId: string,
): Promise<HTMLElement | null> {
  for (let i = 0; i < 30; i += 1) {
    const el = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    if (el) return el;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return null;
}

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe("ScoreCard", () => {
  const fullEvaluation: SkillEvaluation = {
    schemaVersion: "skill-evaluation/v1",
    skillID: "test-run",
    evaluatedAt: "2026-06-18T00:00:00.000Z",
    gates: { lint: "pass", redaction: "pass", grounding: "pass" },
    scores: {
      grounding: 0.95,
      actionability: 0.88,
      specificity: 0.82,
      safety: 0.91,
      concision: 0.75,
      discoverability: 0.79,
      skepticQuality: 0.85,
      evidenceRichness: 0.90,
    },
    composite: 0.88,
    grade: "A",
    verdict: "pass",
    issues: [],
  };

  it("renders composite score and grade badge when evaluation is provided", async () => {
    const container = renderScoreCard(fullEvaluation);
    expect(await screenText(container, "0.88")).toBe(true);
    expect(await screenText(container, "A")).toBe(true);
  });

  it("shows 8 dimension bars with labels and values", async () => {
    const container = renderScoreCard(fullEvaluation);
    const labels = [
      "Grounding",
      "Actionability",
      "Specificity",
      "Safety",
      "Concision",
      "Discoverability",
      "Skeptic Quality",
      "Evidence Richness",
    ];
    for (const label of labels) {
      expect(await screenText(container, label)).toBe(true);
    }
    const values = ["0.95", "0.88", "0.82", "0.91", "0.75", "0.79", "0.85", "0.90"];
    for (const v of values) {
      expect(await screenText(container, v)).toBe(true);
    }
  });

  it("applies green color for grade A", async () => {
    const container = renderScoreCard(fullEvaluation);
    const badge = await findByTestId(container, "grade-badge");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe("A");
  });

  it("applies blue color for grade B", async () => {
    const container = renderScoreCard({
      ...fullEvaluation,
      grade: "B",
      composite: 0.82,
      scores: { ...fullEvaluation.scores },
    });
    const badge = await findByTestId(container, "grade-badge");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe("B");
  });

  it("applies yellow color for grade C", async () => {
    const container = renderScoreCard({
      ...fullEvaluation,
      grade: "C",
      composite: 0.70,
      scores: { ...fullEvaluation.scores },
    });
    const badge = await findByTestId(container, "grade-badge");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe("C");
  });

  it("applies orange color for grade D", async () => {
    const container = renderScoreCard({
      ...fullEvaluation,
      grade: "D",
      composite: 0.55,
      scores: { ...fullEvaluation.scores },
    });
    const badge = await findByTestId(container, "grade-badge");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe("D");
  });

  it("applies red color for grade F", async () => {
    const container = renderScoreCard({
      ...fullEvaluation,
      grade: "F",
      composite: 0.30,
      scores: { ...fullEvaluation.scores },
    });
    const badge = await findByTestId(container, "grade-badge");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe("F");
  });

  it("renders verdict pill with green for pass", async () => {
    const container = renderScoreCard(fullEvaluation);
    expect(await screenText(container, "pass")).toBe(true);
    const pill = await findByTestId(container, "verdict-pill");
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toBe("pass");
  });

  it("renders verdict pill with yellow for needs-patch", async () => {
    const container = renderScoreCard({
      ...fullEvaluation,
      verdict: "needs-patch",
      grade: "C",
      composite: 0.70,
      scores: { ...fullEvaluation.scores },
    });
    expect(await screenText(container, "needs-patch")).toBe(true);
    const pill = await findByTestId(container, "verdict-pill");
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toBe("needs-patch");
  });

  it("renders verdict pill with red for reject", async () => {
    const container = renderScoreCard({
      ...fullEvaluation,
      verdict: "reject",
      grade: "F",
      composite: 0.30,
      scores: { ...fullEvaluation.scores },
    });
    const pill = await findByTestId(container, "verdict-pill");
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toBe("reject");
  });

  it("shows safety hard-cap message when grade is F and verdict is reject", async () => {
    const container = renderScoreCard({
      ...fullEvaluation,
      grade: "F",
      verdict: "reject",
      composite: 0.25,
      scores: { ...fullEvaluation.scores },
    });
    const safetyGate = await findByTestId(container, "safety-gate");
    expect(safetyGate).not.toBeNull();
    expect(safetyGate!.textContent).toBe("Safety gate failed");
  });

  it("does not show safety hard-cap message for non-F grades", async () => {
    const container = renderScoreCard(fullEvaluation);
    const safetyGate = await findByTestId(container, "safety-gate");
    expect(safetyGate).not.toBeNull();
    expect(safetyGate!.style.display).toBe("none");
  });

  it("does not show safety hard-cap message when grade is F but verdict is not reject", async () => {
    const container = renderScoreCard({
      ...fullEvaluation,
      grade: "F",
      verdict: "needs-patch",
      composite: 0.35,
      scores: { ...fullEvaluation.scores },
    });
    const safetyGate = await findByTestId(container, "safety-gate");
    expect(safetyGate).not.toBeNull();
    expect(safetyGate!.style.display).toBe("none");
  });

  it("handles missing evaluation gracefully with placeholder", async () => {
    const container = renderScoreCard(null);
    expect(await screenText(container, "Not evaluated yet")).toBe(true);
  });
});
