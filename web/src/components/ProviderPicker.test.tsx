// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProviderPicker } from "./ProviderPicker.js";
import type { AdapterInfo } from "../runs.js";

const allAvailable: AdapterInfo[] = [
  { type: "sdk", available: true, sourceType: "sdk", sourcePath: null },
  { type: "sqlite", available: true, sourceType: "sqlite", sourcePath: "/db.db" },
  { type: "codex", available: true, sourceType: "sqlite", sourcePath: "/codex.db" },
  { type: "claude", available: true, sourceType: "file", sourcePath: "/claude" },
];

const partialAvailable: AdapterInfo[] = [
  { type: "sdk", available: true, sourceType: "sdk", sourcePath: null },
  { type: "sqlite", available: false, sourceType: "sqlite", sourcePath: null },
  { type: "codex", available: false, sourceType: "sqlite", sourcePath: null },
  { type: "claude", available: false, sourceType: "file", sourcePath: null },
];

describe("ProviderPicker", () => {
  it("renders all adapter options", () => {
    const html = renderToStaticMarkup(
      <ProviderPicker value="all" onChange={() => undefined} adapters={allAvailable} />,
    );

    expect(html).toContain("all");
    expect(html).toContain("opencode");
    expect(html).toContain("codex");
    expect(html).toContain("claude");
    expect(html).toContain("sqlite");
  });

  it("dims unavailable adapters when availability info is provided", () => {
    const html = renderToStaticMarkup(
      <ProviderPicker value="all" onChange={() => undefined} adapters={partialAvailable} />,
    );

    expect(html).toContain("disabled");
    expect(html).toContain("data-available=\"false\"");
  });

  it("marks all as available when no dimming info provided", () => {
    const html = renderToStaticMarkup(
      <ProviderPicker value="all" onChange={() => undefined} />,
    );

    expect(html).not.toContain("disabled");
    expect(html).not.toContain("data-available=\"false\"");
  });

  it("prevents selecting unavailable adapter", () => {
    const html = renderToStaticMarkup(
      <ProviderPicker value="all" onChange={() => undefined} adapters={partialAvailable} />,
    );

    expect(html).toContain("disabled");
  });
});
