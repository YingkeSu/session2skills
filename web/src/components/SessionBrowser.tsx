import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { AdapterError, SessionMeta } from "../runs.js";

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
      return "#2563eb";
    case "sqlite":
      return "#7c3aed";
    case "file":
      return "#ea580c";
    default:
      return "#4b5563";
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
        {filteredSessions.map((session) => {
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
                      color: "#ffffff",
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
        })}
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

const styles: Record<string, React.CSSProperties> = {
  root: {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    background: "#ffffff",
    display: "flex",
    flexDirection: "column",
    maxHeight: 360,
  },
  filters: {
    display: "flex",
    gap: 8,
    padding: "10px 12px",
    borderBottom: "1px solid #e5e7eb",
    flexWrap: "wrap",
    alignItems: "center",
  },
  searchInput: {
    flex: "1 1 180px",
    padding: "6px 10px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 13,
    outline: "none",
    minWidth: 140,
  },
  filterLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 13,
    color: "#374151",
  },
  dateInput: {
    padding: "6px 8px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 13,
    outline: "none",
    fontFamily: "inherit",
  },
  sourceSelect: {
    padding: "6px 8px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 13,
    outline: "none",
    background: "#ffffff",
    cursor: "pointer",
  },
  clearButton: {
    border: "1px solid #d1d5db",
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: 13,
    cursor: "pointer",
    background: "#ffffff",
    color: "#374151",
    fontWeight: 500,
  },
  list: {
    overflowY: "auto",
    padding: 4,
  },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 8,
    cursor: "pointer",
    transition: "background 0.12s ease",
  },
  checkbox: {
    marginTop: 2,
    width: 16,
    height: 16,
    accentColor: "#111827",
    cursor: "pointer",
  },
  rowContent: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: "#111827",
    lineHeight: 1.3,
    wordBreak: "break-word",
  },
  rowMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1,
    padding: "3px 8px",
    borderRadius: 999,
    textTransform: "lowercase",
    letterSpacing: "0.02em",
  },
  time: {
    fontSize: 12,
    color: "#6b7280",
    lineHeight: 1,
  },
  messageCount: {
    fontSize: 12,
    color: "#6b7280",
    lineHeight: 1,
  },
  actionBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderTop: "1px solid #e5e7eb",
    background: "#f9fafb",
    borderRadius: "0 0 10px 10px",
    position: "sticky",
    bottom: 0,
  },
  actionButton: {
    border: "1px solid #d1d5db",
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: 13,
    cursor: "pointer",
    background: "#ffffff",
    color: "#374151",
    fontWeight: 500,
  },
  actionButtonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  selectedCount: {
    marginLeft: "auto",
    fontSize: 13,
    fontWeight: 600,
    color: "#111827",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px 16px",
    textAlign: "center",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    background: "#ffffff",
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 10,
    opacity: 0.7,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: 600,
    color: "#374151",
  },
  emptyHint: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 4,
  },
  errorList: {
    marginTop: 16,
    padding: "10px 12px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 6,
    width: "100%",
    maxWidth: 480,
    textAlign: "left" as const,
  },
  warningBanner: {
    padding: "8px 12px",
    background: "#fef3c7",
    borderBottom: "1px solid #fde68a",
    fontSize: 12,
    color: "#92400e",
  },
  errorRow: {
    marginBottom: 4,
    lineHeight: 1.4,
  },
  errorAdapter: {
    textTransform: "capitalize" as const,
  },
  errorText: {
    color: "#7f1d1d",
  },
};
