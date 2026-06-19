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
});
