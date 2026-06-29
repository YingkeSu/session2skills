// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
    // "opencode" is the single OpenCode entry (backed by the sqlite adapter);
    // there must be no standalone "sqlite"-labeled provider button.
    expect(html).not.toContain("sqlite");
  });

  it("maps the opencode provider to the sqlite adapter (discovery-capable)", () => {
    // Regression: "opencode" used to map to the sdk adapter, which has no
    // project discovery, so the path dropdown never appeared. It must resolve
    // to "sqlite" (the opencode.db-backed adapter) instead.
    const handleChange = vi.fn();
    render(<ProviderPicker value="all" onChange={handleChange} adapters={allAvailable} />);

    fireEvent.click(screen.getByRole("radio", { name: /opencode/i }));

    expect(handleChange).toHaveBeenCalledWith("sqlite");
    expect(handleChange).not.toHaveBeenCalledWith("sdk");
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
