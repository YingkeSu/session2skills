// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "../i18n/LocaleContext.js";
import { withQueryClient } from "../test-utils.js";
import { EvidencePanel } from "./EvidencePanel.js";

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

function renderEvidencePanel(): HTMLDivElement {
  localStorage.setItem("session2skills-locale", "en");
  const container = document.createElement("div");
  document.body.append(container);

  createRoot(container).render(
    withQueryClient(
      <LocaleProvider>
        <EvidencePanel
          evidenceId="ev 1"
          excerpt="Short excerpt"
          sourceType="message"
          runName="run alpha"
        />
      </LocaleProvider>,
    ),
  );

  return container;
}

async function waitForText(text: string): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    if (document.body.textContent?.includes(text)) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Text not found: ${text}`);
}

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("EvidencePanel", () => {
  it("loads full evidence only when the panel is expanded", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ excerpt: "Full evidence text" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderEvidencePanel();

    await waitForText("ev 1");
    expect(fetchMock).not.toHaveBeenCalled();

    const button = document.querySelector("button");
    expect(button).not.toBeNull();
    button?.click();

    await waitForText("Full evidence text");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/runs/run%20alpha/evidence/ev%201",
    );
  });

  it("shows a one-line content preview and source badge without expanding", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ excerpt: "Full evidence text" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    localStorage.setItem("session2skills-locale", "en");
    const container = document.createElement("div");
    document.body.append(container);
    createRoot(container).render(
      withQueryClient(
        <LocaleProvider>
          <EvidencePanel
            evidenceId="ev-1"
            excerpt={"First line of the excerpt\nSecond line never previewed"}
            sourceType="tool"
            runName="run-alpha"
          />
        </LocaleProvider>,
      ),
    );

    await waitForText("ev-1");
    // The source type leads the read; the raw ID is a subdued identifier.
    await waitForText("tool");
    const preview = document.body.querySelector(".s2s-inspector-preview");
    expect(preview?.textContent).toContain("First line of the excerpt");
    // Collapsed: full evidence is not fetched just to render the preview.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("copies the displayed excerpt from the expanded inspector", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ excerpt: "Full evidence text" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderEvidencePanel();
    await waitForText("ev 1");

    const toggle = document.querySelector("button");
    toggle?.click();
    await waitForText("Full evidence text");

    const copyButton = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Copy"),
    );
    expect(copyButton).toBeTruthy();
    copyButton?.click();

    await waitForText("Copied");
    expect(writeText).toHaveBeenCalledWith("Full evidence text");
  });
});
