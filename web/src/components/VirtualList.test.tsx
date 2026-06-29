// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { VirtualList } from "./VirtualList.js";

// jsdom reports no layout geometry, so we mock the viewport + scroll manually.
function mockViewport(container: HTMLElement, viewportHeight: number): void {
  Object.defineProperty(container, "clientHeight", {
    configurable: true,
    get: () => viewportHeight,
  });
  Object.defineProperty(container, "scrollHeight", {
    configurable: true,
    // Total content height: 300 items × 60px.
    get: () => 18000,
  });
  let scrollTop = 0;
  Object.defineProperty(container, "scrollTop", {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

function renderLargeList(viewportHeight = 600): {
  scroller: () => HTMLElement;
} {
  render(
    <VirtualList
      ariaLabel="items"
      itemHeight={60}
      overscan={1}
      viewportHeight={viewportHeight}
      items={Array.from({ length: 300 }, (_, i) => `Item ${i}`)}
      renderItem={(text) => <span>{text}</span>}
    />,
  );

  const scroller = screen.getByTestId("virtual-list");
  mockViewport(scroller, viewportHeight);
  return { scroller: () => scroller };
}

describe("VirtualList", () => {
  it("mounts only a window of items for a large list (no DOM bloat)", () => {
    const { scroller } = renderLargeList();
    // The viewport mock applies after the first paint; bump then reset scroll
    // to force a measurement pass that reads the now-mocked clientHeight.
    act(() => {
      scroller().scrollTop = 1;
      scroller().dispatchEvent(new Event("scroll"));
    });

    const rendered = scroller().querySelectorAll("[data-virtual-index]");
    // 600px viewport / 60px row = 10 visible, +1 overscan each side => ~12.
    expect(rendered.length).toBeLessThanOrEqual(12);
    expect(rendered.length).toBeLessThan(50);

    // First row is present, last row is not.
    expect(scroller().textContent).toContain("Item 0");
    expect(scroller().textContent).not.toContain("Item 299");
  });

  it("brings new items in and removes old ones on scroll", () => {
    const { scroller } = renderLargeList();

    act(() => {
      // Scroll to the bottom: total height 18000 minus viewport 600.
      scroller().scrollTop = 18000 - 600;
      scroller().dispatchEvent(new Event("scroll"));
    });

    expect(scroller().textContent).not.toContain("Item 0");
    expect(scroller().textContent).toContain("Item 299");
    // Still a window, never the whole list.
    const rendered = scroller().querySelectorAll("[data-virtual-index]");
    expect(rendered.length).toBeLessThanOrEqual(12);
  });

  it("renders every row when the list is short (no windowing needed)", () => {
    render(
      <VirtualList
        ariaLabel="small"
        itemHeight={60}
        items={["a", "b", "c"]}
        renderItem={(text) => <span>{text}</span>}
      />,
    );

    const scroller = screen.getByTestId("virtual-list");
    act(() => {
      scroller.dispatchEvent(new Event("scroll"));
    });
    expect(scroller.textContent).toContain("a");
    expect(scroller.textContent).toContain("b");
    expect(scroller.textContent).toContain("c");
    expect(scroller.querySelectorAll("[data-virtual-index]").length).toBe(3);
  });
});
