// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useVirtualList } from "./useVirtualList.js";

// jsdom has no real layout, so element geometry is fully mocked here.
// We give the scroll container a 600px viewport and each item a 60px height,
// then drive scrollTop ourselves to simulate scrolling.
function attachContainer(viewportHeight: number): HTMLElement {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", {
    configurable: true,
    get: () => viewportHeight,
  });
  Object.defineProperty(container, "scrollHeight", {
    configurable: true,
    get: () => 6000,
  });
  // scrollTop is writable by default; mirror it through a getter/setter so
  // the scroll listener dispatch path stays consistent.
  let scrollTop = 0;
  Object.defineProperty(container, "scrollTop", {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
  document.body.append(container);
  return container;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("useVirtualList", () => {
  it("renders only a window of items around the viewport, not the whole list", () => {
    const container = attachContainer(600);
    const items = Array.from({ length: 200 }, (_, i) => i);

    const { result } = renderHook(
      ({ itemHeight, overscan }) =>
        useVirtualList(items, { container, itemHeight, overscan }),
      { initialProps: { itemHeight: 60, overscan: 2 } },
    );

    const { startIndex, endIndex } = result.current;

    // Viewport (600px / 60px) fits 10 items, plus overscan 2 each side => ~14 max.
    expect(endIndex - startIndex).toBeLessThanOrEqual(14);
    expect(startIndex).toBe(0);
    // Well short of the full 200 items.
    expect(endIndex).toBeLessThan(20);
  });

  it("shifts the visible window forward when the container is scrolled down", () => {
    const container = attachContainer(600);
    const items = Array.from({ length: 200 }, (_, i) => i);

    const { result, rerender } = renderHook(
      ({ itemHeight, overscan }) =>
        useVirtualList(items, { container, itemHeight, overscan }),
      { initialProps: { itemHeight: 60, overscan: 2 } },
    );

    const before = result.current.startIndex;

    // Scroll down ~50 items (3000px) and fire the scroll listener.
    act(() => {
      container.scrollTop = 3000;
      container.dispatchEvent(new Event("scroll"));
    });

    rerender({ itemHeight: 60, overscan: 2 });

    const { startIndex, endIndex } = result.current;
    expect(startIndex).toBeGreaterThan(before);
    // Item 0 is no longer in the window.
    expect(startIndex).toBeGreaterThan(0);
    // Item 49 should be near the bottom of the window (3000/60 = 50).
    expect(endIndex).toBeGreaterThanOrEqual(50);
    // Still only a window — never the full list.
    expect(endIndex - startIndex).toBeLessThanOrEqual(14);
  });

  it("clamps the window to the end of a short list", () => {
    const container = attachContainer(600);
    const items = [0, 1, 2, 3];

    const { result } = renderHook(
      ({ itemHeight }) => useVirtualList(items, { container, itemHeight }),
      { initialProps: { itemHeight: 60 } },
    );

    expect(result.current.startIndex).toBe(0);
    expect(result.current.endIndex).toBe(3);
  });

  it("exposes total height and a transform offset for positioning rendered rows", () => {
    const container = attachContainer(600);
    const items = Array.from({ length: 100 }, (_, i) => i);

    const { result } = renderHook(
      ({ itemHeight }) => useVirtualList(items, { container, itemHeight }),
      { initialProps: { itemHeight: 60 } },
    );

    expect(result.current.totalHeight).toBe(6000);
    expect(result.current.offsetY).toBe(0);

    act(() => {
      container.scrollTop = 1200;
      container.dispatchEvent(new Event("scroll"));
    });

    // After scrolling, the offset tracks the first rendered item.
    expect(result.current.offsetY).toBe(result.current.startIndex * 60);
  });
});
