import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import type {
  RawSession,
  RawSessionDiff,
  RawSessionMessages,
  RawSessionModel,
} from "../../normalize/raw-session.js";
import type { SessionProvider, SessionProviderOptions } from "../provider.js";
import { OpenCodeAdapterError, toErrorMessage } from "../../shared/errors.js";
import { getProjectSessionsDir } from "./paths.js";
import {
  extractMeta,
  parseEntries,
  parseTranscriptFile,
  type TranscriptMeta,
} from "./parse-transcript.js";

const JSONL_EXT = ".jsonl";

export function createClaudeSessionProvider(): SessionProvider {
  return {
    async listRecentSessions(options, recent) {
      return listRecent(options, recent);
    },
    async getSession(options, sessionID) {
      return fetchSession(options, sessionID);
    },
    async getSessionMessages(options, sessionID, limit) {
      return fetchMessages(options, sessionID, limit);
    },
    async getSessionDiff() {
      return [];
    },
    async close() {
    },
  };
}

function listRecent(options: SessionProviderOptions, recent: number): Array<RawSession> {
  const projectDir = getProjectSessionsDir(options.directory);
  if (!existsSync(projectDir)) return [];

  const index = tryReadIndex(projectDir);
  if (index) {
    return index.entries
      .map((entry) => indexEntryToRawSession(entry, options.directory))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, recent);
  }

  let names: Array<string>;
  try {
    names = readdirSync(projectDir);
  } catch (error) {
    throw new OpenCodeAdapterError(
      `Failed to read Claude project dir ${projectDir}: ${toErrorMessage(error)}`,
      { cause: error },
    );
  }

  const sessions: Array<RawSession> = [];
  for (const name of names) {
    if (!name.endsWith(JSONL_EXT)) continue;
    const filePath = path.join(projectDir, name);
    try {
      sessions.push(peekToRawSession(peekSessionFile(filePath), options.directory));
    } catch {
      // Skip unreadable transcript files rather than failing the whole listing.
    }
  }

  sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  return sessions.slice(0, recent);
}

function fetchSession(options: SessionProviderOptions, sessionID: string): RawSession {
  const filePath = resolveSessionFile(options, sessionID);
  try {
    const peek = peekSessionFile(filePath);
    return {
      id: sessionID,
      title: titleFrom(peek.meta.firstPrompt),
      directory: peek.meta.cwd ?? options.directory,
      updatedAt: peek.mtimeMs,
      createdAt: peek.meta.firstTimestamp,
      model: defaultModel(peek.meta.model),
    };
  } catch (error) {
    if (error instanceof OpenCodeAdapterError) throw error;
    throw new OpenCodeAdapterError(
      `Failed to read Claude session ${sessionID}: ${toErrorMessage(error)}`,
      { cause: error },
    );
  }
}

function fetchMessages(
  options: SessionProviderOptions,
  sessionID: string,
  limit?: number,
): RawSessionMessages {
  const filePath = resolveSessionFile(options, sessionID);
  let messages: RawSessionMessages;
  try {
    messages = parseTranscriptFile(filePath).messages;
  } catch (error) {
    if (error instanceof OpenCodeAdapterError) throw error;
    throw new OpenCodeAdapterError(
      `Failed to read messages for session ${sessionID}: ${toErrorMessage(error)}`,
      { cause: error },
    );
  }
  if (limit !== undefined && limit > 0 && messages.length > limit) {
    return messages.slice(messages.length - limit);
  }
  return messages;
}

function resolveSessionFile(options: SessionProviderOptions, sessionID: string): string {
  const projectDir = getProjectSessionsDir(options.directory);
  const filePath = path.join(projectDir, `${sessionID}${JSONL_EXT}`);
  if (!existsSync(filePath)) {
    throw new OpenCodeAdapterError(`Session not found: ${sessionID}`);
  }
  return filePath;
}

type Peeked = { sessionId: string; mtimeMs: number; meta: TranscriptMeta };

function peekSessionFile(filePath: string): Peeked {
  const stat = statSync(filePath);
  const raw = readFileSync(filePath, "utf8");
  const meta = extractMeta(parseEntries(raw));
  return { sessionId: sessionIdFromFilename(filePath), mtimeMs: stat.mtimeMs, meta };
}

function peekToRawSession(peek: Peeked, fallbackDir: string): RawSession {
  return {
    id: peek.sessionId,
    title: titleFrom(peek.meta.firstPrompt),
    directory: peek.meta.cwd ?? fallbackDir,
    updatedAt: peek.mtimeMs,
    createdAt: peek.meta.firstTimestamp,
    model: defaultModel(peek.meta.model),
  };
}

type IndexEntry = {
  sessionId?: string;
  firstPrompt?: string;
  modified?: string;
  messageCount?: number;
  gitBranch?: string;
  isSidechain?: boolean;
  fullPath?: string;
  fileMtime?: number;
};

function tryReadIndex(projectDir: string): { entries: Array<IndexEntry> } | undefined {
  const indexPath = path.join(projectDir, "sessions-index.json");
  if (!existsSync(indexPath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(indexPath, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.entries)) return undefined;
    return { entries: obj.entries as Array<IndexEntry> };
  } catch {
    return undefined;
  }
}

function indexEntryToRawSession(entry: IndexEntry, fallbackDir: string): RawSession {
  return {
    id: entry.sessionId ?? "",
    title: titleFrom(entry.firstPrompt),
    directory: fallbackDir,
    updatedAt: entry.fileMtime ?? parseTimestamp(entry.modified) ?? 0,
    createdAt: undefined,
    model: defaultModel(),
  };
}

function defaultModel(model?: string): RawSessionModel {
  return { id: model ?? "claude", providerID: "anthropic" };
}

function titleFrom(firstPrompt: string | undefined): string {
  return firstPrompt && firstPrompt.trim() ? firstPrompt : "Untitled";
}

function parseTimestamp(ts: unknown): number | undefined {
  if (typeof ts !== "string") return undefined;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? undefined : ms;
}

function sessionIdFromFilename(filePath: string): string {
  const base = path.basename(filePath);
  return base.endsWith(JSONL_EXT) ? base.slice(0, -JSONL_EXT.length) : base;
}
