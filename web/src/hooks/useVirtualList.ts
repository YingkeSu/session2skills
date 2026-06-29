import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Options for {@link useVirtualList}.
 */
export type UseVirtualListOptions = {
  /** The scroll container that owns the viewport. If null, the whole list renders. */
  container: HTMLElement | null;
  /** Fixed estimated row height in pixels. */
  itemHeight: number;
  /** Extra rows rendered above/below the viewport to keep scrolling smooth. */
  overscan?: number;
};

/**
 * A minimal, dependency-free windowing hook.
 *
 * Renders only the rows whose estimated positions intersect the scroll
 * container's viewport (plus an overscan band), instead of mounting the whole
 * list. It is driven entirely by scroll position so it stays testable in jsdom
 * (no IntersectionObserver geometry required) while still benefiting from a
 * ResizeObserver in real browsers when present.
 *
 * The consumer is responsible for:
 *   - rendering {@link VirtualWindow.totalHeight} as the inner spacer height,
 *   - translating each row by {@link VirtualWindow.offsetY} + its relative index.
 */
export function useVirtualList<T>(
  items: ReadonlyArray<T>,
  { container, itemHeight, overscan = 3 }: UseVirtualListOptions,
): {
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  offsetY: number;
} {
  const [scrollTop, setScrollTop] = useState(0);

  // Keep the offset reactive even before the first scroll event (e.g. when the
  // container is reattached or the list shrinks). We re-read on every render.
  const measuredRef = useRef(0);
  measuredRef.current = container ? container.scrollTop : 0;

  useEffect(() => {
    if (!container) return;

    const handleScroll = (): void => {
      setScrollTop(container.scrollTop);
    };

    // Sync immediately so the first paint reflects the container's offset.
    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => handleScroll());
      resizeObserver.observe(container);
    }

    return () => {
      container.removeEventListener("scroll", handleScroll);
      resizeObserver?.disconnect();
    };
  }, [container]);

  return useMemo(() => {
    const totalHeight = items.length * itemHeight;

    if (!container) {
      return { startIndex: 0, endIndex: Math.max(items.length - 1, 0), totalHeight, offsetY: 0 };
    }

    const viewport = container.clientHeight || 0;
    // Before the first layout measurement (clientHeight 0, e.g. jsdom's first
    // paint), don't mount the whole list — render a conservative initial band.
    // Real browsers measure on mount, so this only affects the unmeasured frame.
    const visibleCount =
      viewport > 0 ? Math.ceil(viewport / itemHeight) : Math.min(items.length, 16);

    // Prefer the live scrollTop so a scroll event and a re-render agree, but
    // fall back to the stateful value when only state has changed.
    const offset = Math.max(measuredRef.current || scrollTop, 0);
    const firstVisible = Math.floor(offset / itemHeight);
    const startIndex = Math.max(0, firstVisible - overscan);
    const lastVisible = firstVisible + visibleCount;
    const endIndex = Math.min(items.length - 1, Math.max(startIndex, lastVisible + overscan));

    return {
      startIndex,
      endIndex: Math.max(endIndex, startIndex),
      totalHeight,
      offsetY: startIndex * itemHeight,
    };
  }, [items, itemHeight, overscan, container, scrollTop]);
}
