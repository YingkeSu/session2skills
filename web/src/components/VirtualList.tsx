import { useRef, useState, type JSX, type ReactNode } from "react";

import { useVirtualList } from "../hooks/useVirtualList.js";

/**
 * Props for {@link VirtualList}.
 */
export type VirtualListProps<T> = {
  items: ReadonlyArray<T>;
  /** Fixed estimated row height in pixels. */
  itemHeight: number;
  /** Extra rows rendered above/below the viewport. */
  overscan?: number;
  /** Renders the item at `index`. */
  renderItem: (item: T, index: number) => ReactNode;
  /** Optional className for the scroll container. */
  className?: string;
  /** Inline style overrides for the scroll container. */
  style?: React.CSSProperties;
  /** Accessible label for the scroll region. */
  ariaLabel?: string;
  /** Min height for the scroll viewport when empty. */
  viewportHeight?: number | string;
};

/**
 * A dependency-free virtualized list.
 *
 * Only the window of items overlapping the scroll viewport is mounted; the
 * full extent is preserved with a spacer div so the scrollbar stays honest.
 * Row layout is offset with `transform: translateY()` to avoid layout thrash.
 *
 * When the list is short enough to fit without scrolling, every row renders —
 * so small lists keep their exact ordering and accessibility semantics.
 */
export function VirtualList<T>({
  items,
  itemHeight,
  overscan,
  renderItem,
  className,
  style,
  ariaLabel,
  viewportHeight = 360,
}: VirtualListProps<T>): JSX.Element {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const measuredRef = useRef<HTMLElement | null>(null);
  const isStacked = viewportHeight === "none";

  const window = useVirtualList(items, {
    container,
    itemHeight,
    overscan,
  });

  const minHeight =
    typeof viewportHeight === "number"
      ? `${viewportHeight}px`
      : isStacked
        ? undefined
        : viewportHeight;

  const renderedItems = isStacked
    ? items.map((item, index) => ({ item, index }))
    : items
        .slice(window.startIndex, window.endIndex + 1)
        .map((item, relativeIndex) => ({
          item,
          index: window.startIndex + relativeIndex,
        }));

  return (
    <div
      ref={(node) => {
        measuredRef.current = node;
        setContainer(node);
      }}
      className={className}
      role={ariaLabel ? "list" : undefined}
      aria-label={ariaLabel}
      data-testid="virtual-list"
      style={{
        overflowY: isStacked ? "visible" : "auto",
        position: "relative",
        minHeight,
        ...style,
      }}
    >
      {isStacked ? (
        renderedItems.map(({ item, index }) => (
          <div
            key={index}
            data-virtual-index={index}
            style={{ minHeight: `${itemHeight}px` }}
          >
            {renderItem(item, index)}
          </div>
        ))
      ) : (
      <div
        style={{
          height: `${window.totalHeight}px`,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            transform: `translateY(${window.offsetY}px)`,
          }}
        >
          {renderedItems.map(({ item, index }) => (
            <div
              key={index}
              data-virtual-index={index}
              style={{ minHeight: `${itemHeight}px` }}
            >
              {renderItem(item, index)}
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}
