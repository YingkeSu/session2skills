// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { LocaleProvider } from "../i18n/LocaleContext.js";
import { AuditViewTab } from "./AuditViewTab.js";
import type { ClaimManifest, SkepticReport, VerifierReport } from "../runs.js";

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

function renderAuditTab(
  manifest: ClaimManifest,
  skepticReport: SkepticReport | null,
  verifierReport: VerifierReport | null,
): HTMLDivElement {
  localStorage.setItem("session2skills-locale", "en");
  const container = document.createElement("div");
  document.body.append(container);

  createRoot(container).render(
    <LocaleProvider>
      <AuditViewTab
        manifest={manifest}
        skepticReport={skepticReport}
        verifierReport={verifierReport}
        runName="run-audit"
      />
    </LocaleProvider>,
  );

  return container;
}

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe("AuditViewTab", () => {
  it("groups claims by dimension and shows missing evidence refs plainly", async () => {
    renderAuditTab(
      {
        schemaVersion: "claim-manifest/v1",
        evidenceSummary: "Summary",
        dimensionsCovered: ["behavior", "safety"],
        claims: [
          {
            id: "claim-1",
            dimension: "behavior",
            label: "Behavior claim",
            confidence: 0.91,
            rationale: "Reason one",
            evidenceRefs: ["ev-1", "missing-1"],
          },
          {
            id: "claim-2",
            dimension: "safety",
            label: "Safety claim",
            confidence: 0.42,
            rationale: "Reason two",
            evidenceRefs: [],
          },
        ],
        metadata: {
          generatedAt: "2026-06-18T00:00:00Z",
          sessionCount: 1,
          totalEvidenceItems: 1,
        },
        evidence: [
          {
            evidenceID: "ev-1",
            sourceType: "message",
            excerpt: "Evidence excerpt",
          },
        ],
      },
      {
        schemaVersion: "skeptic-report/v1",
        issues: [
          {
            claimId: "claim-1",
            severity: "high",
            problemType: "gap",
            detail: "Detail",
            suggestion: "Suggestion",
          },
        ],
        overallScore: 0.4,
        metadata: {
          generatedAt: "2026-06-18T00:00:00Z",
          claimCount: 2,
          issueCount: 1,
        },
      },
      {
        schemaVersion: "verifier-report/v1",
        pass: false,
        checkedItems: [
          {
            directive: "directive",
            claimId: "claim-1",
            status: "verified",
          },
        ],
        issues: [],
        metadata: {
          generatedAt: "2026-06-18T00:00:00Z",
          directiveCount: 1,
          verifiedCount: 1,
          fabricatedCount: 0,
        },
      },
    );

    expect(await screenText("behavior")).toBeTruthy();
    expect(await screenText("safety")).toBeTruthy();
    expect(await screenText("Missing evidence: missing-1")).toBeTruthy();
    expect(await screenText("91%")).toBeTruthy();
    expect(await screenText("42%")).toBeTruthy();
  });
});

async function screenText(text: string): Promise<string | null> {
  for (let i = 0; i < 20; i += 1) {
    if (document.body.textContent?.includes(text)) return text;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return null;
}
