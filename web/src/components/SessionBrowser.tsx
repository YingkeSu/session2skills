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

// Source type → categorical badge fill, shared with the rest of the cockpit.
function sourceBadgeClass(sourceType: string): string {
  switch (sourceType) {
    case "sdk":
      return "s2s-badge-blue";
    case "sqlite":
      return "s2s-badge-violet";
    case "file":
      return "s2s-badge-amber";
    default:
      return "s2s-badge-muted";
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
      <div className="s2s-empty-state">
        <div className="s2s-empty-icon">📭</div>
        <div className="s2s-empty-title">No sessions found</div>
        <div className="s2s-empty-hint">Try a different adapter or directory</div>
        {adapterErrors && adapterErrors.length > 0 && (
          <div className="s2s-error-list" role="alert">
            {adapterErrors.map((err) => (
              <div key={err.adapter} className="s2s-error-row">
                <strong className="s2s-error-adapter">{err.adapter}:</strong>{" "}
                <span className="s2s-error-text">{err.error}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (filteredSessions.length === 0) {
    return (
      <div className="s2s-empty-state">
        <div className="s2s-empty-icon">🔍</div>
        <div className="s2s-empty-title">No results</div>
        <div className="s2s-empty-hint">Try adjusting your filters</div>
      </div>
    );
  }

  return (
    <div className="s2s-list-panel">
      {adapterErrors && adapterErrors.length > 0 && (
        <div className="s2s-warning-banner" role="status">
          {adapterErrors.map((err) => (
            <div key={err.adapter} className="s2s-error-row">
              <strong className="s2s-error-adapter">{err.adapter}:</strong>{" "}
              <span className="s2s-error-text">{err.error}</span>
            </div>
          ))}
        </div>
      )}
      <div className="s2s-browser-filters">
        <input
          type="text"
          className="s2s-input s2s-browser-search"
          placeholder="Search sessions..."
          value={searchText}
          onChange={(e) => setSearchText(e.currentTarget.value)}
          aria-label="Search sessions"
        />
        <label className="s2s-browser-label">
          <span>From:</span>
          <input
            type="date"
            className="s2s-input"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.currentTarget.value)}
          />
        </label>
        <label className="s2s-browser-label">
          <span>To:</span>
          <input
            type="date"
            className="s2s-input"
            value={dateTo}
            onChange={(e) => setDateTo(e.currentTarget.value)}
          />
        </label>
        <label className="s2s-browser-label">
          <span>Source:</span>
          <select
            className="s2s-select"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.currentTarget.value)}
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
            className="s2s-btn s2s-btn-ghost"
            onClick={handleClearFilters}
          >
            Clear filters
          </button>
        )}
      </div>
      <div className="s2s-browser-list">
        <VirtualList
          ariaLabel="Sessions"
          itemHeight={sessionItemHeight}
          overscan={4}
          viewportHeight="none"
          items={filteredSessions}
          style={{ maxHeight: 320 }}
          renderItem={(session) => {
            const checked = isSelected(selected, session);
            const badgeClass = sourceBadgeClass(session.sourceType);
            return (
              <label key={session.sessionId} className="s2s-browser-row">
                <input
                  type="checkbox"
                  className="s2s-checkbox"
                  checked={checked}
                  onChange={() => handleToggle(session)}
                />
                <div className="s2s-browser-content">
                  <div className="s2s-browser-title">
                    {session.title ?? "Untitled"}
                  </div>
                  <div className="s2s-browser-meta">
                    <span
                      className={`s2s-badge s2s-badge-sm s2s-badge-lc ${badgeClass}`}
                    >
                      {session.providerId}
                    </span>
                    <span className="s2s-meta-text">
                      {formatRelativeTime(session.updatedAt)}
                    </span>
                    {typeof session.messageCount === "number" && (
                      <span className="s2s-meta-text">
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
      <div className="s2s-browser-actions">
        <button
          type="button"
          className="s2s-btn"
          onClick={handleSelectAll}
          disabled={allSelected}
        >
          Select All
        </button>
        <button
          type="button"
          className="s2s-btn"
          onClick={handleClear}
          disabled={selected.length === 0}
        >
          Clear
        </button>
        <span className="s2s-browser-count">
          {selected.length} selected
        </span>
      </div>
    </div>
  );
}

// Two-line session row (title + meta) ≈ padding + 1.3 line-height each.
const sessionItemHeight = 58;
