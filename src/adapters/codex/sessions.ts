import type Database from "better-sqlite3";
import { existsSync } from "node:fs";
import type {
  SessionProvider,
  SessionProviderOptions,
} from "../provider.js";
import type {
  RawSession,
  RawSessionDiff,
  RawSessionMessages,
  RawSessionModel,
  RawTokenUsage,
} from "../../normalize/raw-session.js";
import { OpenCodeAdapterError, toErrorMessage } from "../../shared/errors.js";
import { createCodexClient, type CodexClientHandle } from "./client.js";
import { getCodexSqlitePath } from "./paths.js";
import { parseRolloutFile } from "./parse-rollout.js";
import type { CodexThreadRow } from "./types.js";

export function createCodexSessionProvider(dbPath?: string): SessionProvider & {
  close: () => Promise<void>;
} {
  let handle: CodexClientHandle | undefined;

  function resolveDbPath(): string {
    return dbPath ?? getCodexSqlitePath();
  }

  function dbAvailable(): boolean {
    return existsSync(resolveDbPath());
  }

  function getDb(): Database.Database {
    if (!handle) {
      if (!dbAvailable()) {
        throw new OpenCodeAdapterError(
          `Codex SQLite not found at ${resolveDbPath()}`,
        );
      }
      handle = createCodexClient(resolveDbPath());
    }
    return handle.db;
  }

  return {
    async listRecentSessions(
      options: SessionProviderOptions,
      recent: number,
    ): Promise<Array<RawSession>> {
      try {
        if (!dbAvailable()) return [];

        const db = getDb();
        const rows = db
          .prepare(
            "SELECT * FROM threads WHERE archived = 0 AND cwd = ? ORDER BY updated_at DESC LIMIT ?",
          )
          .all(options.directory, recent) as Array<CodexThreadRow>;

        return rows.map(mapThreadRow);
      } catch (error) {
        if (error instanceof OpenCodeAdapterError) throw error;
        throw new OpenCodeAdapterError(
          `Failed to list Codex sessions for ${options.directory}: ${toErrorMessage(error)}`,
          { cause: error },
        );
      }
    },

    async getSession(
      _options: SessionProviderOptions,
      sessionID: string,
    ): Promise<RawSession> {
      try {
        const db = getDb();
        const row = db.prepare("SELECT * FROM threads WHERE id = ?").get(
          sessionID,
        ) as CodexThreadRow | undefined;

        if (!row) {
          throw new OpenCodeAdapterError(`Codex session not found: ${sessionID}`);
        }
        return mapThreadRow(row);
      } catch (error) {
        if (error instanceof OpenCodeAdapterError) throw error;
        throw new OpenCodeAdapterError(
          `Failed to get Codex session ${sessionID}: ${toErrorMessage(error)}`,
          { cause: error },
        );
      }
    },

    async getSessionMessages(
      _options: SessionProviderOptions,
      sessionID: string,
      limit?: number,
    ): Promise<RawSessionMessages> {
      try {
        const db = getDb();
        const row = db
          .prepare("SELECT rollout_path FROM threads WHERE id = ?")
          .get(sessionID) as { rollout_path: string } | undefined;

        if (!row) {
          throw new OpenCodeAdapterError(
            `Codex session not found: ${sessionID}`,
          );
        }

        const messages = parseRolloutFile(row.rollout_path, sessionID);
        if (limit !== undefined && limit >= 0) {
          return messages.slice(-limit);
        }
        return messages;
      } catch (error) {
        if (error instanceof OpenCodeAdapterError) throw error;
        throw new OpenCodeAdapterError(
          `Failed to get messages for Codex session ${sessionID}: ${toErrorMessage(error)}`,
          { cause: error },
        );
      }
    },

    async getSessionDiff(
      _options: SessionProviderOptions,
      _sessionID: string,
    ): Promise<Array<RawSessionDiff>> {
      return [];
    },

    async close(): Promise<void> {
      handle?.close();
      handle = undefined;
    },
  };
}

function mapThreadRow(row: CodexThreadRow): RawSession {
  const model: RawSessionModel = {
    id: "codex",
    providerID: row.model_provider,
  };

  const tokens: RawTokenUsage | undefined =
    row.tokens_used > 0
      ? {
          input: 0,
          output: 0,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        }
      : undefined;

  return {
    id: row.id,
    title: row.title,
    directory: row.cwd,
    updatedAt: row.updated_at * 1000,
    createdAt: row.created_at * 1000,
    model,
    tokens,
  };
}
