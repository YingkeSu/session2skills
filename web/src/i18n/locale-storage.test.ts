import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadSavedLocale, saveLocale } from "./locale-storage.js";

describe("loadSavedLocale / saveLocale", () => {
  beforeEach(() => {
    let store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when nothing is saved", () => {
    expect(loadSavedLocale()).toBeNull();
  });

  it("round-trips a saved locale", () => {
    saveLocale("en");
    expect(loadSavedLocale()).toBe("en");
  });

  it("returns null for an invalid stored value", () => {
    localStorage.setItem("session2skills-locale", "fr");
    expect(loadSavedLocale()).toBeNull();
  });

  it("defaults to zh when no saved locale exists", () => {
    expect(loadSavedLocale() ?? "zh").toBe("zh");
  });
});
