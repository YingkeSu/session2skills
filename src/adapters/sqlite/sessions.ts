import type Database from "better-sqlite3";
import type { SessionProvider, SessionProviderOptions } from "../provider.js";
import type {
  RawMessage,
  RawMessageInfo,
  RawPart,
  RawSession,
  RawSessionDiff,
  RawSessionMessages,
  RawSessionModel,
  RawSessionSummary,
  RawToolState,
  RawTokenUsage,
} from "../../normalize/raw-session.js";
import { OpenCodeAdapterError, toErrorMessage } from "../../shared/errors.js";
import { createSqliteClient, type SqliteClientHandle } from "./client.js";

type SessionRow = {
  id: string;
  project_id: string;
  parent_id: string | null;
  slug: string;
  directory: string;
  title: string;
  version: string;
  share_url: string | null;
  summary_additions: number | null;
  summary_deletions: number | null;
  summary_files: number | null;
  summary_diffs: string | null;
  revert: string | null;
  permission: string | null;
  time_created: number;
  time_updated: number;
  time_compacting: number | null;
  time_archived: number | null;
  workspace_id: string | null;
  path: string | null;
  agent: string | null;
  model: string | null;
  cost: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  tokens_reasoning: number | null;
  tokens_cache_read: number | null;
  tokens_cache_write: number | null;
};

type MessageRow = {
  id: string;
  session_id: string;
  data: string;
};

type PartRow = {
  id: string;
  message_id: string;
  session_id: string;
  data: string;
};

type MessageData = {
  role: string;
  mode?: string;
  agent?: string;
  variant?: string;
  path?: { cwd: string; root: string };
  cost?: number;
  tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number }; total?: number };
  modelID?: string;
  providerID?: string;
  time: { created: number; completed?: number };
  finish?: string;
};

type PartData = {
  type: string;
  text?: string;
  time?: { start?: number; end?: number };
  tool?: string;
  callID?: string;
  state?: {
    status: string;
    input?: Record<string, unknown>;
    output?: string;
    error?: string;
    title?: string;
    time?: { start?: number; end?: number };
    metadata?: Record<string, unknown>;
  };
  description?: string;
  prompt?: string;
  files?: Array<string>;
  name?: string;
  snapshot?: string;
  reason?: string;
  cost?: number;
  tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } };
};

export function createSqliteSessionProvider(
  dbPath?: string,
  options: { eager?: boolean } = {},
): SessionProvider & { close: () => Promise<void> } {
  let handle: SqliteClientHandle | undefined = options.eager
    ? createSqliteClient(dbPath)
    : undefined;

  function getDb(): Database.Database {
    if (!handle) {
      handle = createSqliteClient(dbPath);
    }
    return handle.db;
  }

  return {
    async listRecentSessions(options: SessionProviderOptions, recent: number): Promise<Array<RawSession>> {
      try {
        const db = getDb();
        const rows = db.prepare(
          buildSessionListQuery(options.workspace),
        ).all(options.directory, options.workspace ?? null, recent) as Array<SessionRow>;

        return rows.map(mapSessionRow);
      } catch (error) {
        throw new OpenCodeAdapterError(
          `Failed to list sessions for ${options.directory}: ${toErrorMessage(error)}`,
          { cause: error },
        );
      }
    },

    async getSession(options: SessionProviderOptions, sessionID: string): Promise<RawSession> {
      try {
        const db = getDb();
        const row = db.prepare("SELECT * FROM session WHERE id = ?").get(sessionID) as SessionRow | undefined;

        if (!row) {
          throw new OpenCodeAdapterError(`Session not found: ${sessionID}`);
        }

        return mapSessionRow(row);
      } catch (error) {
        if (error instanceof OpenCodeAdapterError) throw error;
        throw new OpenCodeAdapterError(
          `Failed to get session ${sessionID}: ${toErrorMessage(error)}`,
          { cause: error },
        );
      }
    },

    async getSessionMessages(options: SessionProviderOptions, sessionID: string, limit?: number): Promise<RawSessionMessages> {
      try {
        const db = getDb();
        const messageRows = db.prepare(
          "SELECT id, session_id, data FROM message WHERE session_id = ? ORDER BY json_extract(data, '$.time.created') ASC LIMIT ?",
        ).all(sessionID, limit ?? -1) as Array<MessageRow>;

        if (messageRows.length === 0) return [];

        const messageIds = messageRows.map((m) => m.id);
        const partRows = queryPartsByMessageIds(db, messageIds);

        const partsByMessage = groupPartsByMessage(partRows);

        return messageRows.map((msgRow) => {
          const data = parseJson<MessageData>(msgRow.data);
          const parts = partsByMessage.get(msgRow.id) ?? [];
          return mapMessage(msgRow, data, parts);
        });
      } catch (error) {
        throw new OpenCodeAdapterError(
          `Failed to get messages for session ${sessionID}: ${toErrorMessage(error)}`,
          { cause: error },
        );
      }
    },

    async getSessionDiff(_options: SessionProviderOptions, sessionID: string): Promise<Array<RawSessionDiff>> {
      try {
        const db = getDb();
        return extractDiffs(db, sessionID);
      } catch (error) {
        throw new OpenCodeAdapterError(
          `Failed to get diff for session ${sessionID}: ${toErrorMessage(error)}`,
          { cause: error },
        );
      }
    },

    async close(): Promise<void> {
      handle?.close();
      handle = undefined;
    },
  };
}

function buildSessionListQuery(hasWorkspace?: string): string {
  if (hasWorkspace) {
    return "SELECT * FROM session WHERE directory = ? AND workspace_id = ? ORDER BY time_updated DESC LIMIT ?";
  }
  return "SELECT * FROM session WHERE directory = ? AND (? IS NULL OR workspace_id IS NULL) ORDER BY time_updated DESC LIMIT ?";
}

function queryPartsByMessageIds(db: Database.Database, messageIds: Array<string>): Array<PartRow> {
  if (messageIds.length === 0) return [];

  const CHUNK_SIZE = 500;
  const results: Array<PartRow> = [];

  for (let i = 0; i < messageIds.length; i += CHUNK_SIZE) {
    const chunk = messageIds.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = db.prepare(
      `SELECT id, message_id, session_id, data FROM part WHERE message_id IN (${placeholders}) ORDER BY id ASC`,
    ).all(...chunk) as Array<PartRow>;
    results.push(...rows);
  }

  return results;
}

function groupPartsByMessage(parts: Array<PartRow>): Map<string, Array<PartRow>> {
  const map = new Map<string, Array<PartRow>>();
  for (const part of parts) {
    const list = map.get(part.message_id);
    if (list) {
      list.push(part);
    } else {
      map.set(part.message_id, [part]);
    }
  }
  return map;
}

function extractDiffs(db: Database.Database, sessionID: string): Array<RawSessionDiff> {
  const partRows = db.prepare(
    `SELECT data FROM part WHERE session_id = ? AND json_extract(data, '$.type') = 'patch'`,
  ).all(sessionID) as Array<{ data: string }>;

  if (partRows.length === 0) return [];

  const seen = new Set<string>();
  const diffs: Array<RawSessionDiff> = [];

  for (const row of partRows) {
    const data = parseJson<PartData>(row.data);
    if (data.files) {
      for (const file of data.files) {
        if (!seen.has(file)) {
          seen.add(file);
          diffs.push({ file, additions: 0, deletions: 0 });
        }
      }
    }
  }

  return diffs;
}

function mapSessionRow(row: SessionRow): RawSession {
  const summary = mapSummary(row);
  const model = mapModel(row.model);

  return {
    id: row.id,
    projectID: row.project_id,
    workspaceID: row.workspace_id ?? undefined,
    title: row.title,
    directory: row.directory,
    updatedAt: row.time_updated,
    summary,
    parentID: row.parent_id ?? undefined,
    slug: row.slug,
    createdAt: row.time_created,
    agent: row.agent ?? undefined,
    model,
    cost: row.cost ?? undefined,
    tokens: mapSessionTokens(row),
  };
}

function mapSummary(row: SessionRow): RawSessionSummary | undefined {
  if (row.summary_files == null) return undefined;
  return {
    files: row.summary_files,
    additions: row.summary_additions ?? 0,
    deletions: row.summary_deletions ?? 0,
  };
}

function mapModel(modelJson: string | null): RawSessionModel | undefined {
  if (!modelJson) return undefined;
  try {
    return parseJson<RawSessionModel>(modelJson);
  } catch {
    return undefined;
  }
}

function mapSessionTokens(row: SessionRow): RawTokenUsage | undefined {
  if (row.tokens_input == null && row.tokens_output == null) return undefined;
  return {
    input: row.tokens_input ?? 0,
    output: row.tokens_output ?? 0,
    reasoning: row.tokens_reasoning ?? 0,
    cache: {
      read: row.tokens_cache_read ?? 0,
      write: row.tokens_cache_write ?? 0,
    },
  };
}

function mapMessage(msgRow: MessageRow, data: MessageData, partRows: Array<PartRow>): RawMessage {
  const info: RawMessageInfo = {
    id: msgRow.id,
    sessionID: msgRow.session_id,
    role: data.role,
    createdAt: data.time.created,
    agent: data.agent,
    mode: data.mode,
    modelID: data.modelID,
    providerID: data.providerID,
    cost: data.cost,
    tokens: data.tokens ? mapTokens(data.tokens) : undefined,
    path: data.path,
    variant: data.variant,
    completedAt: data.time.completed,
  };

  return {
    info,
    parts: partRows.map((pr) => mapPart(pr, msgRow.session_id)),
  };
}

function mapTokens(t: { input: number; output: number; reasoning: number; cache: { read: number; write: number }; total?: number }): RawTokenUsage {
  return {
    input: t.input,
    output: t.output,
    reasoning: t.reasoning,
    cache: t.cache,
  };
}

function mapPart(partRow: PartRow, fallbackSessionID: string): RawPart {
  const data = parseJson<PartData>(partRow.data);

  const base = {
    id: partRow.id,
    sessionID: partRow.session_id ?? fallbackSessionID,
    messageID: partRow.message_id,
    type: data.type,
  };

  switch (data.type) {
    case "text":
    case "reasoning":
      return { ...base, text: data.text };
    case "subtask":
      return { ...base, description: data.description, prompt: data.prompt };
    case "tool":
      return {
        ...base,
        tool: data.tool,
        callID: data.callID,
        state: data.state ? mapToolState(data.state) : undefined,
      };
    case "patch":
      return { ...base, files: data.files };
    case "agent":
      return { ...base, name: data.name };
    case "step-start":
      return { ...base, snapshot: data.snapshot };
    case "step-finish":
      return {
        ...base,
        reason: data.reason,
        snapshot: data.snapshot,
        stepCost: data.cost,
        stepTokens: data.tokens ? mapTokens(data.tokens) : undefined,
      };
    default:
      return base;
  }
}

function mapToolState(state: NonNullable<PartData["state"]>): RawToolState {
  return {
    status: state.status,
    title: state.title,
    input: state.input,
    output: state.output,
    error: state.error,
    time: state.time,
  };
}

function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new OpenCodeAdapterError(
      `Malformed JSON in DB: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
}
