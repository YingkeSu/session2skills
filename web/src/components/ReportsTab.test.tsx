// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { LocaleProvider } from "../i18n/LocaleContext.js";
import { ReportsTab } from "./ReportsTab.js";
import type { SkepticReport, VerifierReport } from "../runs.js";

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

function renderReports(
  skepticReport: SkepticReport | null,
  verifierReport: VerifierReport | null,
): void {
  localStorage.setItem("session2skills-locale", "en");
  const container = document.createElement("div");
  document.body.append(container);
  createRoot(container).render(
    <LocaleProvider>
      <ReportsTab skepticReport={skepticReport} verifierReport={verifierReport} />
    </LocaleProvider>,
  );
}

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe("ReportsTab", () => {
  it("keeps issue severity and verifier status visible in the summary rows", async () => {
    renderReports(
      {
        schemaVersion: "skeptic-report/v1",
        overallScore: 0.33,
        issues: [
          {
            claimId: "claim-9",
            severity: "high",
            problemType: "gap",
            detail: "Detail",
            suggestion: "Suggestion",
          },
        ],
        metadata: {
          generatedAt: "2026-06-18T00:00:00Z",
          claimCount: 1,
          issueCount: 1,
        },
      },
      {
        schemaVersion: "verifier-report/v1",
        pass: false,
        checkedItems: [
          {
            directive: "dir-1",
            claimId: "claim-9",
            status: "fabricated",
          },
        ],
        issues: [],
        metadata: {
          generatedAt: "2026-06-18T00:00:00Z",
          directiveCount: 1,
          verifiedCount: 0,
          fabricatedCount: 1,
        },
      },
    );

    expect(await waitForText("high")).toBeTruthy();
    expect(await waitForText("fabricated")).toBeTruthy();
    expect(await waitForText("1 issue across 1 claims")).toBeTruthy();
  });
});

async function waitForText(text: string): Promise<string | null> {
  for (let i = 0; i < 20; i += 1) {
    if (document.body.textContent?.includes(text)) return text;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return null;
}
