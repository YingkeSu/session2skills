// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { LocaleProvider } from "../i18n/LocaleContext.js";
import { PreviewTracesTab } from "./PreviewTracesTab.js";

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

function renderPreview(): void {
  localStorage.setItem("session2skills-locale", "en");
  const container = document.createElement("div");
  document.body.append(container);
  createRoot(container).render(
    <LocaleProvider>
      <PreviewTracesTab
        skillMarkdown={"# Title\n\n- item one\n- item two"}
        traces={[
          {
            stage: "verifier",
            model: "gpt-4.1",
            provider: "openai",
            usage: {
              prompt_tokens: 12,
              completion_tokens: 8,
              total_tokens: 20,
            },
            latencyMs: 123,
            finishReason: "stop",
            promptName: "verify-skill",
          },
        ]}
      />
    </LocaleProvider>,
  );
}

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe("PreviewTracesTab", () => {
  it("renders markdown and trace metadata in readable blocks", async () => {
    renderPreview();

    expect(await waitForText("Title")).toBeTruthy();
    expect(await waitForText("item one")).toBeTruthy();
    expect(await waitForText("gpt-4.1")).toBeTruthy();
    expect(await waitForText("openai")).toBeTruthy();
    expect(await waitForText("20 tokens")).toBeTruthy();
  });
});

async function waitForText(text: string): Promise<string | null> {
  for (let i = 0; i < 20; i += 1) {
    if (document.body.textContent?.includes(text)) return text;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return null;
}
