// @vitest-environment jsdom
import React from "react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { withQueryClient } from "../test-utils.js";
import type { SessionMeta } from "../runs.js";
import type { SessionSelection } from "./SessionBrowser.js";
import { SessionBrowser } from "./SessionBrowser.js";

const sessions: SessionMeta[] = [
  {
    providerId: "opencode",
    sessionId: "sess-1",
    title: "Implement auth flow",
    sourceType: "sdk",
    sourcePath: null,
    updatedAt: 1_700_000_000_000,
    messageCount: 42,
  },
  {
    providerId: "codex",
    sessionId: "sess-2",
    title: null,
    sourceType: "sqlite",
    sourcePath: "/home/user/.codex/state.sqlite",
    updatedAt: 1_699_000_000_000,
    messageCount: 18,
  },
  {
    providerId: "claude",
    sessionId: "sess-3",
    title: "Refactor API handlers",
    sourceType: "file",
    sourcePath: null,
    updatedAt: 1_698_000_000_000,
    messageCount: 7,
  },
];

afterEach(() => {
  document.body.replaceChildren();
  if (typeof localStorage !== "undefined") {
    localStorage.clear();
  }
  if (typeof window !== "undefined" && window.history?.replaceState) {
    window.history.replaceState(null, "", window.location.pathname);
  }
});

describe("SessionBrowser", () => {
  it("renders list of sessions with title, source badge, and message count", () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(
      withQueryClient(
        <SessionBrowser
          sessions={sessions}
          selected={[]}
          onChange={onChange}
        />,
      ),
    );

    expect(html).toContain("Implement auth flow");
    expect(html).toContain("opencode");
    expect(html).toContain("42");
  });

  it("shows 'Untitled' when title is null", () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(
      withQueryClient(
        <SessionBrowser
          sessions={sessions}
          selected={[]}
          onChange={onChange}
        />,
      ),
    );

    expect(html).toContain("Untitled");
  });

  it("shows 'No sessions found' when list is empty", () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(
      withQueryClient(
        <SessionBrowser
          sessions={[]}
          selected={[]}
          onChange={onChange}
        />,
      ),
    );

    expect(html).toContain("No sessions found");
  });

  it("shows selected count in action bar", () => {
    const onChange = vi.fn();
    const selected = [
      { adapter: "opencode", sessionId: "sess-1" },
      { adapter: "codex", sessionId: "sess-2" },
    ];
    const html = renderToStaticMarkup(
      withQueryClient(
        <SessionBrowser
          sessions={sessions}
          selected={selected}
          onChange={onChange}
        />,
      ),
    );

    expect(html).toContain("2 selected");
  });
});

function createSessionBrowserContainer(
  props: { sessions: SessionMeta[]; selected: SessionSelection[]; onChange: (selections: SessionSelection[]) => void },
): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  root.render(
    withQueryClient(
      <SessionBrowser
        sessions={props.sessions}
        selected={props.selected}
        onChange={props.onChange}
      />,
    ),
  );
  return container;
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("SessionBrowser filters", () => {
  it("renders search, date, and source filter inputs", () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(
      withQueryClient(
        <SessionBrowser sessions={sessions} selected={[]} onChange={onChange} />,
      ),
    );

    expect(html).toContain("Search sessions...");
    expect(html).toContain("From:");
    expect(html).toContain("To:");
    expect(html).toContain("Source:");
  });

  it("shows all sessions when no filters are active", async () => {
    const onChange = vi.fn();
    const { container } = render(
      withQueryClient(
        <SessionBrowser sessions={sessions} selected={[]} onChange={onChange} />,
      ),
    );
    await flushMicrotasks();

    expect(container.textContent).toContain("Implement auth flow");
    expect(container.textContent).toContain("Refactor API handlers");
    expect(container.textContent).toContain("Untitled");
  });

  it("filters sessions by keyword search in title", async () => {
    const onChange = vi.fn();
    const { container } = render(
      withQueryClient(
        <SessionBrowser sessions={sessions} selected={[]} onChange={onChange} />,
      ),
    );
    await flushMicrotasks();

    const searchInput = container.querySelector('input[placeholder="Search sessions..."]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();
    if (!searchInput) return;

    fireEvent.change(searchInput, { target: { value: "auth" } });
    await flushMicrotasks();

    expect(container.textContent).toContain("Implement auth flow");
    expect(container.textContent).not.toContain("Refactor API handlers");
  });

  it("filters sessions by date from", async () => {
    const onChange = vi.fn();
    const { container } = render(
      withQueryClient(
        <SessionBrowser sessions={sessions} selected={[]} onChange={onChange} />,
      ),
    );
    await flushMicrotasks();

    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);
    const fromDateInput = dateInputs[0] as HTMLInputElement;

    fireEvent.change(fromDateInput, { target: { value: "2023-11-05" } });
    await flushMicrotasks();

    expect(fromDateInput.value).toBe("2023-11-05");
    expect(container.textContent).toContain("Implement auth flow");
    expect(container.textContent).not.toContain("Untitled");
    expect(container.textContent).not.toContain("Refactor API handlers");
  });

  it("filters sessions by date to", async () => {
    const onChange = vi.fn();
    const { container } = render(
      withQueryClient(
        <SessionBrowser sessions={sessions} selected={[]} onChange={onChange} />,
      ),
    );
    await flushMicrotasks();

    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);
    const toDateInput = dateInputs[1] as HTMLInputElement;

    fireEvent.change(toDateInput, { target: { value: "2023-11-05" } });
    await flushMicrotasks();

    expect(toDateInput.value).toBe("2023-11-05");
    expect(container.textContent).not.toContain("Implement auth flow");
    expect(container.textContent).toContain("Untitled");
    expect(container.textContent).toContain("Refactor API handlers");
  });

  it("filters sessions by source type", async () => {
    const onChange = vi.fn();
    const { container } = render(
      withQueryClient(
        <SessionBrowser sessions={sessions} selected={[]} onChange={onChange} />,
      ),
    );
    await flushMicrotasks();

    const sourceSelect = container.querySelector("select") as HTMLSelectElement | null;
    expect(sourceSelect).not.toBeNull();
    if (!sourceSelect) return;

    fireEvent.change(sourceSelect, { target: { value: "codex" } });
    await flushMicrotasks();

    expect(sourceSelect.value).toBe("codex");
    expect(container.textContent).toContain("Untitled");
    expect(container.textContent).not.toContain("Implement auth flow");
    expect(container.textContent).not.toContain("Refactor API handlers");
  });

  it("shows no results state when filters exclude all sessions", async () => {
    const onChange = vi.fn();
    const { container } = render(
      withQueryClient(
        <SessionBrowser sessions={sessions} selected={[]} onChange={onChange} />,
      ),
    );
    await flushMicrotasks();

    const searchInput = container.querySelector('input[placeholder="Search sessions..."]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();
    if (!searchInput) return;

    fireEvent.change(searchInput, { target: { value: "nonexistent session title xyz" } });
    await flushMicrotasks();

    expect(searchInput.value).toBe("nonexistent session title xyz");
    expect(container.textContent).toContain("No results");
    expect(container.textContent).toContain("Try adjusting your filters");
  });

  it("clear filters button resets all filter inputs", async () => {
    const onChange = vi.fn();
    const { container } = render(
      withQueryClient(
        <SessionBrowser sessions={sessions} selected={[]} onChange={onChange} />,
      ),
    );
    await flushMicrotasks();

    const searchInput = container.querySelector('input[placeholder="Search sessions..."]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();
    if (!searchInput) return;

    fireEvent.change(searchInput, { target: { value: "auth" } });
    await flushMicrotasks();

    const clearButton = screen.getByRole("button", { name: "Clear filters" });
    expect(clearButton).not.toBeNull();

    fireEvent.click(clearButton);
    await flushMicrotasks();

    expect(searchInput.value).toBe("");
    expect(container.textContent).toContain("Implement auth flow");
    expect(container.textContent).toContain("Refactor API handlers");
    expect(container.textContent).toContain("Untitled");
  });
});
