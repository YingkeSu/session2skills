import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { AdapterError, SessionMeta } from "../runs.js";
import { VirtualList } from "./VirtualList.js";

export type SessionSelection = { adapter: string; sessionId: string };

type SessionBrowserProps = {
  sessions: SessionMeta[];
  selected: SessionSelection[];
  onChange: (selections: SessionSelection[]) => void;
  adapterErrors?: AdapterError[];
};

function formatRelativeTime(timestamp: number | null): string {
  if (timestamp === null) return "";
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function sourceBadgeColor(sourceType: string): string {
  switch (sourceType) {
    case "sdk":
      return "var(--cat-blue)";
    case "sqlite":
      return "var(--cat-violet)";
    case "file":
      return "var(--cat-amber)";
    default:
      return "var(--cat-gray)";
  }
}

function isSelected(
  selected: SessionSelection[],
  session: SessionMeta,
): boolean {
  return selected.some(
    (s) => s.adapter === session.providerId && s.sessionId === session.sessionId,
  );
}

export function SessionBrowser({
  sessions,
  selected,
  onChange,
  adapterErrors,
}: SessionBrowserProps): ReactNode {
  const [searchText, setSearchText] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setSearchText(params.get("search") ?? "");
    setDateFrom(params.get("from") ?? "");
    setDateTo(params.get("to") ?? "");
    const urlSource = params.get("source");
    setSourceFilter(urlSource ?? "all");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (searchText) params.set("search", searchText);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (sourceFilter !== "all") params.set("source", sourceFilter);
    const query = params.toString();
    const url = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [searchText, dateFrom, dateTo, sourceFilter]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      if (searchText) {
        const title = session.title ?? "";
        if (!title.toLowerCase().includes(searchText.toLowerCase())) {
          return false;
        }
      }
      if (dateFrom && session.updatedAt !== null) {
        const fromTime = new Date(dateFrom).getTime();
        if (session.updatedAt < fromTime) return false;
      }
      if (dateTo && session.updatedAt !== null) {
        const toTime = new Date(dateTo).getTime();
        const endOfDay = toTime + 24 * 60 * 60 * 1000 - 1;
        if (session.updatedAt > endOfDay) return false;
      }
      if (sourceFilter !== "all" && session.providerId !== sourceFilter) {
        return false;
      }
      return true;
    });
  }, [sessions, searchText, dateFrom, dateTo, sourceFilter]);

  const hasActiveFilters =
    searchText !== "" || dateFrom !== "" || dateTo !== "" || sourceFilter !== "all";

  const handleClearFilters = (): void => {
    setSearchText("");
    setDateFrom("");
    setDateTo("");
    setSourceFilter("all");
  };

  const allSelected =
    filteredSessions.length > 0 && selected.length === filteredSessions.length;

  const handleToggle = (session: SessionMeta): void => {
    const active = isSelected(selected, session);
    if (active) {
      onChange(
        selected.filter(
          (s) => !(s.adapter === session.providerId && s.sessionId === session.sessionId),
        ),
      );
    } else {
      onChange([
        ...selected,
        { adapter: session.providerId, sessionId: session.sessionId },
      ]);
    }
  };

  const handleSelectAll = (): void => {
    onChange(
      filteredSessions.map((s) => ({
        adapter: s.providerId,
        sessionId: s.sessionId,
      })),
    );
  };

  const handleClear = (): void => {
    onChange([]);
  };

  if (sessions.length === 0) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}>📭</div>
        <div style={styles.emptyText}>No sessions found</div>
        <div style={styles.emptyHint}>Try a different adapter or directory</div>
        {adapterErrors && adapterErrors.length > 0 && (
          <div style={styles.errorList} role="alert">
            {adapterErrors.map((err) => (
              <div key={err.adapter} style={styles.errorRow}>
                <strong style={styles.errorAdapter}>{err.adapter}:</strong>{" "}
                <span style={styles.errorText}>{err.error}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (filteredSessions.length === 0) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}>🔍</div>
        <div style={styles.emptyText}>No results</div>
        <div style={styles.emptyHint}>Try adjusting your filters</div>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {adapterErrors && adapterErrors.length > 0 && (
        <div style={styles.warningBanner} role="status">
          {adapterErrors.map((err) => (
            <div key={err.adapter} style={styles.errorRow}>
              <strong style={styles.errorAdapter}>{err.adapter}:</strong>{" "}
              <span style={styles.errorText}>{err.error}</span>
            </div>
          ))}
        </div>
      )}
      <div style={styles.filters}>
        <input
          type="text"
          placeholder="Search sessions..."
          value={searchText}
          onChange={(e) => setSearchText(e.currentTarget.value)}
          style={styles.searchInput}
          aria-label="Search sessions"
        />
        <label style={styles.filterLabel}>
          <span>From:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.currentTarget.value)}
            style={styles.dateInput}
          />
        </label>
        <label style={styles.filterLabel}>
          <span>To:</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.currentTarget.value)}
            style={styles.dateInput}
          />
        </label>
        <label style={styles.filterLabel}>
          <span>Source:</span>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.currentTarget.value)}
            style={styles.sourceSelect}
          >
            <option value="all">All</option>
            <option value="sdk">opencode</option>
            <option value="codex">codex</option>
            <option value="claude">claude</option>
            <option value="sqlite">sqlite</option>
          </select>
        </label>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearFilters}
            style={styles.clearButton}
          >
            Clear filters
          </button>
        )}
      </div>
      <div style={styles.list}>
        <VirtualList
          ariaLabel="Sessions"
          itemHeight={sessionItemHeight}
          overscan={4}
          viewportHeight="none"
          items={filteredSessions}
          style={{ maxHeight: 320 }}
          renderItem={(session) => {
            const checked = isSelected(selected, session);
            const badgeColor = sourceBadgeColor(session.sourceType);
            return (
              <label key={session.sessionId} style={styles.row}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => handleToggle(session)}
                  style={styles.checkbox}
                />
                <div style={styles.rowContent}>
                  <div style={styles.rowTitle}>
                    {session.title ?? "Untitled"}
                  </div>
                  <div style={styles.rowMeta}>
                    <span
                      style={{
                        ...styles.badge,
                        background: badgeColor,
                        color: "var(--ink-on-fill)",
                      }}
                    >
                      {session.providerId}
                    </span>
                    <span style={styles.time}>
                      {formatRelativeTime(session.updatedAt)}
                    </span>
                    {typeof session.messageCount === "number" && (
                      <span style={styles.messageCount}>
                        {session.messageCount} messages
                      </span>
                    )}
                  </div>
                </div>
              </label>
            );
          }}
        />
      </div>
      <div style={styles.actionBar}>
        <button
          type="button"
          onClick={handleSelectAll}
          disabled={allSelected}
          style={{
            ...styles.actionButton,
            ...(allSelected ? styles.actionButtonDisabled : {}),
          }}
        >
          Select All
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={selected.length === 0}
          style={{
            ...styles.actionButton,
            ...(selected.length === 0 ? styles.actionButtonDisabled : {}),
          }}
        >
          Clear
        </button>
        <span style={styles.selectedCount}>
          {selected.length} selected
        </span>
      </div>
    </div>
  );
}

// Two-line session row (title + meta) ≈ padding + 1.3 line-height each.
const sessionItemHeight = 58;

const styles: Record<string, React.CSSProperties> = {
  root: {
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    background: "var(--surface)",
    display: "flex",
    flexDirection: "column",
    maxHeight: 360,
  },
  filters: {
    display: "flex",
    gap: "var(--space-2)",
    padding: "var(--space-3)",
    borderBottom: "1px solid var(--border)",
    flexWrap: "wrap",
    alignItems: "center",
  },
  searchInput: {
    flex: "1 1 180px",
    padding: "var(--space-2) var(--space-3)",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius)",
    fontSize: "var(--text-sm)",
    outline: "none",
    minWidth: 140,
    color: "var(--ink)",
    background: "var(--surface)",
  },
  filterLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--space-1)",
    fontSize: "var(--text-sm)",
    color: "var(--ink-2)",
  },
  dateInput: {
    padding: "var(--space-2)",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius)",
    fontSize: "var(--text-sm)",
    outline: "none",
    fontFamily: "inherit",
    color: "var(--ink)",
    background: "var(--surface)",
  },
  sourceSelect: {
    padding: "var(--space-2)",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius)",
    fontSize: "var(--text-sm)",
    outline: "none",
    background: "var(--surface)",
    color: "var(--ink)",
    cursor: "pointer",
  },
  clearButton: {
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius)",
    padding: "var(--space-2) var(--space-3)",
    fontSize: "var(--text-sm)",
    cursor: "pointer",
    background: "var(--surface)",
    color: "var(--ink-2)",
    fontWeight: 500,
  },
  list: {
    padding: "var(--space-1)",
  },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: "var(--space-3)",
    padding: "var(--space-3)",
    borderRadius: "var(--radius)",
    cursor: "pointer",
    transition: "background 0.12s ease",
  },
  checkbox: {
    marginTop: 2,
    width: 16,
    height: 16,
    accentColor: "var(--accent)",
    cursor: "pointer",
  },
  rowContent: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-1)",
    minWidth: 0,
    flex: 1,
  },
  rowTitle: {
    fontSize: "var(--text-base)",
    fontWeight: 500,
    color: "var(--ink)",
    lineHeight: 1.3,
    wordBreak: "break-word",
  },
  rowMeta: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-2)",
    flexWrap: "wrap",
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1,
    padding: "3px var(--space-2)",
    borderRadius: "var(--radius-pill)",
    textTransform: "lowercase",
    letterSpacing: "0.02em",
  },
  time: {
    fontSize: "var(--text-xs)",
    color: "var(--ink-muted)",
    lineHeight: 1,
  },
  messageCount: {
    fontSize: "var(--text-xs)",
    color: "var(--ink-muted)",
    lineHeight: 1,
  },
  actionBar: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-3)",
    padding: "var(--space-3)",
    borderTop: "1px solid var(--border)",
    background: "var(--surface-2)",
    borderRadius: "0 0 var(--radius-lg) var(--radius-lg)",
    position: "sticky",
    bottom: 0,
  },
  actionButton: {
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius)",
    padding: "var(--space-2) var(--space-3)",
    fontSize: "var(--text-sm)",
    cursor: "pointer",
    background: "var(--surface)",
    color: "var(--ink-2)",
    fontWeight: 500,
  },
  actionButtonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  selectedCount: {
    marginLeft: "auto",
    fontSize: "var(--text-sm)",
    fontWeight: 600,
    color: "var(--ink)",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px var(--space-4)",
    textAlign: "center",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    background: "var(--surface)",
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: "var(--space-3)",
    opacity: 0.7,
  },
  emptyText: {
    fontSize: "var(--text-md)",
    fontWeight: 600,
    color: "var(--ink-2)",
  },
  emptyHint: {
    fontSize: "var(--text-sm)",
    color: "var(--ink-muted)",
    marginTop: "var(--space-1)",
  },
  errorList: {
    marginTop: "var(--space-4)",
    padding: "var(--space-3)",
    background: "var(--danger-soft)",
    border: "1px solid var(--danger)",
    borderRadius: "var(--radius)",
    width: "100%",
    maxWidth: 480,
    textAlign: "left" as const,
  },
  warningBanner: {
    padding: "var(--space-2) var(--space-3)",
    background: "var(--warning-soft)",
    borderBottom: "1px solid var(--warning)",
    fontSize: "var(--text-xs)",
    color: "var(--warning-ink)",
  },
  errorRow: {
    marginBottom: "var(--space-1)",
    lineHeight: 1.4,
  },
  errorAdapter: {
    textTransform: "capitalize" as const,
  },
  errorText: {
    color: "var(--danger-ink)",
  },
};
