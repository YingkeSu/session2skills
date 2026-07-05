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

function renderPreview(
  skillMarkdown = "# Title\n\n- item one\n- item two",
): void {
  localStorage.setItem("session2skills-locale", "en");
  const container = document.createElement("div");
  document.body.append(container);
  createRoot(container).render(
    <LocaleProvider>
      <PreviewTracesTab
        skillMarkdown={skillMarkdown}
        writerSections={{
          sections: [
            {
              title: "Constraints and anti-patterns",
              directives: [
                {
                  text: "Preserve the existing command shape.",
                  sourceClaimId: "claim_001",
                },
              ],
            },
          ],
        }}
        traces={[
          {
            stage: "verifier",
            model: "gpt-4.1",
            provider: "openai",
            usage: {
              inputTokens: 12,
              outputTokens: 8,
              totalTokens: 20,
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

  it("renders compact writer sections when writer output is available", async () => {
    renderPreview();

    expect(await waitForText("Writer Output")).toBeTruthy();
    expect(await waitForText("Constraints and anti-patterns")).toBeTruthy();
    expect(await waitForText("Preserve the existing command shape.")).toBeTruthy();
    expect(await waitForText("claim_001")).toBeTruthy();
  });

  it("renders unsupported HTML as text instead of DOM nodes", async () => {
    renderPreview(
      [
        "# <img src=x onerror=alert(1)>",
        "",
        "- <script>alert(1)</script>",
        "Plain <strong>bold</strong>",
      ].join("\n"),
    );

    expect(await waitForText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(await waitForText("<script>alert(1)</script>")).toBeTruthy();
    expect(await waitForText("Plain <strong>bold</strong>")).toBeTruthy();
    const markdownBox = document.body.querySelector(".s2s-prose");
    expect(markdownBox).toBeTruthy();
    expect(markdownBox?.querySelector("img")).toBeNull();
    expect(markdownBox?.querySelector("script")).toBeNull();
    expect(markdownBox?.querySelector("strong")).toBeNull();
  });

  it("renders token counts from backend camelCase field names (inputTokens/outputTokens/totalTokens)", async () => {
    localStorage.setItem("session2skills-locale", "en");
    const container = document.createElement("div");
    document.body.append(container);
    createRoot(container).render(
      <LocaleProvider>
        <PreviewTracesTab
          skillMarkdown={null}
          writerSections={null}
          traces={[
            {
              stage: "analyst",
              model: "deepseek-v3",
              provider: "deepseek",
              usage: {
                inputTokens: 150,
                outputTokens: 80,
                totalTokens: 230,
              },
              latencyMs: 456,
            },
          ]}
        />
      </LocaleProvider>,
    );

    expect(await waitForText("230 tokens")).toBeTruthy();
    expect(await waitForText("150")).toBeTruthy();
    expect(await waitForText("80")).toBeTruthy();
  });

  it("renders fenced code literally and caps long previews", async () => {    const markdown = [
      "```html",
      "<div>literal</div>",
      "```",
      ...Array.from({ length: 501 }, (_, index) => `line ${index + 1}`),
    ].join("\n");

    renderPreview(markdown);

    expect(await waitForText("<div>literal</div>")).toBeTruthy();
    expect(document.body.querySelector("code")?.textContent).toContain(
      "<div>literal</div>",
    );
    expect(await waitForText("Preview truncated after 500 lines.")).toBeTruthy();
    expect(document.body.textContent).toContain("line 497");
    expect(document.body.textContent).not.toContain("line 498");
  });

  it("stacks the trace list so expanded trace rows can grow without overlap", async () => {
    localStorage.setItem("session2skills-locale", "en");
    const container = document.createElement("div");
    document.body.append(container);
    const manyTraces = Array.from({ length: 400 }, (_, i) => ({
      stage: "analyst",
      model: `model-${i}`,
      provider: "openai",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    }));
    createRoot(container).render(
      <LocaleProvider>
        <PreviewTracesTab
          skillMarkdown={null}
          writerSections={null}
          traces={manyTraces}
        />
      </LocaleProvider>,
    );

    await waitForText("model-0");
    const scroller = document.body.querySelector('[data-testid="virtual-list"]');
    expect(scroller).toBeTruthy();
    const rendered = scroller!.querySelectorAll("[data-virtual-index]");
    expect(rendered).toHaveLength(400);
    expect((scroller as HTMLElement).style.minHeight).toBe("");
    expect((scroller as HTMLElement).style.overflowY).toBe("visible");
    expect((rendered[0] as HTMLElement).style.height).toBe("");
    expect((rendered[0] as HTMLElement).style.minHeight).toBe("56px");
    expect(document.body.textContent).toContain("model-399");
  });
});

async function waitForText(text: string): Promise<string | null> {
  for (let i = 0; i < 20; i += 1) {
    if (document.body.textContent?.includes(text)) return text;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return null;
}
