// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LocaleProvider } from "../i18n/LocaleContext.js";
import { RawJsonDrawer } from "./RawJsonDrawer.js";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  },
  configurable: true,
});

afterEach(() => {
  document.body.replaceChildren();
  storage.clear();
});

describe("RawJsonDrawer", () => {
  it("keeps the JSON body out of the DOM while collapsed", () => {
    storage.set("session2skills-locale", "en");
    render(
      <LocaleProvider>
        <RawJsonDrawer value={{ name: "ada" }} testId="raw-closed" />
      </LocaleProvider>,
    );

    const details = screen.getByTestId("raw-closed");
    expect(details.hasAttribute("open")).toBe(false);
    // Lazily rendered: no JSON tokens present while collapsed.
    expect(details.querySelectorAll(".json-key").length).toBe(0);
    // The toggle exposes a "show raw" label.
    expect(details.querySelector("summary")?.textContent ?? "").toMatch(/raw/i);
  });

  it("renders syntax-highlighted JSON tokens when opened", () => {
    storage.set("session2skills-locale", "en");
    render(
      <LocaleProvider>
        <RawJsonDrawer value={{ name: "ada" }} testId="raw-open" defaultOpen />
      </LocaleProvider>,
    );

    const details = screen.getByTestId("raw-open");
    expect(details.hasAttribute("open")).toBe(true);

    const keySpans = details.querySelectorAll(".json-key");
    expect(keySpans.length).toBeGreaterThan(0);
    expect(keySpans[0].textContent).toBe('"name"');
    expect(details.querySelector(".json-string")?.textContent).toBe('"ada"');
  });
});
