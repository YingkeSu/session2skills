import type { Message, OpencodeClient, Part, Session, SnapshotFileDiff } from "@opencode-ai/sdk/v2";

import { OpenCodeAdapterError, toErrorMessage } from "../../shared/errors.js";
import type { RawPart, RawSession, RawSessionDiff, RawSessionMessages, RawTokenUsage, RawToolState } from "../../normalize/raw-session.js";
import { createTypedOpenCodeClient, toSessionQuery, type OpenCodeConnectionOptions } from "./client.js";

export type SessionMessagesResult = RawSessionMessages;

export async function listRecentSessionsWithClient(
  client: OpencodeClient,
  options: OpenCodeConnectionOptions,
  recent: number,
): Promise<Array<RawSession>> {
  const result = await client.session.list<true>({
    ...toSessionQuery(options),
    limit: recent,
  }, {
    throwOnError: true,
  });

  return [...result.data].map(toRawSession).sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function getSessionWithClient(
  client: OpencodeClient,
  options: OpenCodeConnectionOptions,
  sessionID: string,
): Promise<RawSession> {
  const result = await client.session.get<true>({
    ...toSessionQuery(options),
    sessionID,
  }, {
    throwOnError: true,
  });

  return toRawSession(result.data);
}

export async function getSessionMessagesWithClient(
  client: OpencodeClient,
  options: OpenCodeConnectionOptions,
  sessionID: string,
  limit?: number,
): Promise<SessionMessagesResult> {
  const result = await client.session.messages<true>({
    ...toSessionQuery(options),
    sessionID,
    limit,
  }, {
    throwOnError: true,
  });

  return result.data.map(toRawMessage);
}

export async function getSessionDiffWithClient(
  client: OpencodeClient,
  options: OpenCodeConnectionOptions,
  sessionID: string,
  messageID?: string,
): Promise<Array<RawSessionDiff>> {
  const result = await client.session.diff<true>({
    ...toSessionQuery(options),
    sessionID,
    messageID,
  }, {
    throwOnError: true,
  });

  return result.data.map(toRawDiff);
}

export async function listRecentSessions(
  options: OpenCodeConnectionOptions,
  recent: number,
): Promise<Array<RawSession>> {
  try {
    const { client, close } = await createTypedOpenCodeClient(options);

    try {
      return await listRecentSessionsWithClient(client, options, recent);
    } finally {
      await close();
    }
  } catch (error) {
    throw new OpenCodeAdapterError(
      `Failed to list OpenCode sessions for ${options.directory}: ${toErrorMessage(error)}`,
      { cause: error },
    );
  }
}

export async function getSession(
  options: OpenCodeConnectionOptions,
  sessionID: string,
): Promise<RawSession> {
  try {
    const { client, close } = await createTypedOpenCodeClient(options);

    try {
      return await getSessionWithClient(client, options, sessionID);
    } finally {
      await close();
    }
  } catch (error) {
    throw new OpenCodeAdapterError(
      `Failed to load OpenCode session ${sessionID}: ${toErrorMessage(error)}`,
      { cause: error },
    );
  }
}

export async function getSessionMessages(
  options: OpenCodeConnectionOptions,
  sessionID: string,
  limit?: number,
): Promise<SessionMessagesResult> {
  try {
    const { client, close } = await createTypedOpenCodeClient(options);

    try {
      return await getSessionMessagesWithClient(client, options, sessionID, limit);
    } finally {
      await close();
    }
  } catch (error) {
    throw new OpenCodeAdapterError(
      `Failed to load messages for OpenCode session ${sessionID}: ${toErrorMessage(error)}`,
      { cause: error },
    );
  }
}

export async function getSessionSummary(
  options: OpenCodeConnectionOptions,
  sessionID: string,
): Promise<RawSession["summary"] | undefined> {
  const session = await getSession(options, sessionID);

  return session.summary;
}

export async function getSessionDiff(
  options: OpenCodeConnectionOptions,
  sessionID: string,
  messageID?: string,
): Promise<Array<RawSessionDiff>> {
  try {
    const { client, close } = await createTypedOpenCodeClient(options);

    try {
      return await getSessionDiffWithClient(client, options, sessionID, messageID);
    } finally {
      await close();
    }
  } catch (error) {
    throw new OpenCodeAdapterError(
      `Failed to load diff for OpenCode session ${sessionID}: ${toErrorMessage(error)}`,
      { cause: error },
    );
  }
}

function toRawSession(session: Session): RawSession {
  const sessionRecord = session as unknown as Record<string, unknown>;
  const modelData = sessionRecord.model as { id: string; providerID: string; variant?: string } | undefined;

  return {
    id: session.id,
    projectID: session.projectID,
    workspaceID: session.workspaceID,
    title: session.title,
    directory: session.directory,
    updatedAt: session.time.updated,
    summary: session.summary
      ? {
          files: session.summary.files,
          additions: session.summary.additions,
          deletions: session.summary.deletions,
        }
      : undefined,
    parentID: (session as unknown as { parentID?: string }).parentID,
    slug: session.slug,
    createdAt: session.time.created,
    agent: sessionRecord.agent as string | undefined,
    model: modelData
      ? { id: modelData.id, providerID: modelData.providerID, variant: modelData.variant }
      : undefined,
  };
}

function toRawMessage(message: { info: Message; parts: Array<Part> }): RawSessionMessages[number] {
  const info = message.info as Record<string, unknown>;
  const isAssistant = message.info.role === "assistant";

  return {
    info: {
      id: message.info.id,
      sessionID: message.info.sessionID,
      role: message.info.role,
      createdAt: message.info.time.created,
      agent: isAssistant ? info.agent as string | undefined : undefined,
      mode: isAssistant ? info.mode as string | undefined : undefined,
      modelID: isAssistant ? info.modelID as string | undefined : undefined,
      providerID: isAssistant ? info.providerID as string | undefined : undefined,
      cost: isAssistant ? info.cost as number | undefined : undefined,
      tokens: isAssistant && info.tokens
        ? mapTokens(info.tokens as { input: number; output: number; reasoning: number; cache: { read: number; write: number } })
        : undefined,
      path: isAssistant ? info.path as { cwd: string; root: string } | undefined : undefined,
      variant: isAssistant ? info.variant as string | undefined : undefined,
      completedAt: isAssistant ? (message.info.time as Record<string, unknown>).completed as number | undefined : undefined,
    },
    parts: message.parts.map(toRawPart),
  };
}

function mapTokens(t: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }): RawTokenUsage {
  return { input: t.input, output: t.output, reasoning: t.reasoning, cache: t.cache };
}

function toRawPart(part: Part): RawPart {
  switch (part.type) {
    case "text":
    case "reasoning":
      return {
        id: part.id,
        sessionID: part.sessionID,
        messageID: part.messageID,
        type: part.type,
        text: part.text,
      };
    case "subtask":
      return {
        id: part.id,
        sessionID: part.sessionID,
        messageID: part.messageID,
        type: part.type,
        description: part.description,
        prompt: part.prompt,
      };
    case "tool":
      return {
        id: part.id,
        sessionID: part.sessionID,
        messageID: part.messageID,
        type: part.type,
        tool: part.tool,
        callID: part.callID,
        state: toRawToolState(part.state),
      };
    case "patch":
      return {
        id: part.id,
        sessionID: part.sessionID,
        messageID: part.messageID,
        type: part.type,
        files: [...part.files],
      };
    case "agent":
      return {
        id: part.id,
        sessionID: part.sessionID,
        messageID: part.messageID,
        type: part.type,
        name: part.name,
      };
    default:
      return {
        id: part.id,
        sessionID: part.sessionID,
        messageID: part.messageID,
        type: part.type,
      };
  }
}

function toRawToolState(state: Extract<Part, { type: "tool" }>['state']): RawToolState {
  return {
    status: state.status,
    title: "title" in state ? state.title : undefined,
    input: "input" in state ? state.input : undefined,
    output: "output" in state ? state.output : undefined,
    error: "error" in state ? state.error : undefined,
    time: "time" in state
      ? {
          start: state.time.start,
          end: "end" in state.time ? state.time.end : undefined,
        }
      : undefined,
  };
}

function toRawDiff(diff: SnapshotFileDiff): RawSessionDiff {
  return {
    file: diff.file,
    additions: diff.additions,
    deletions: diff.deletions,
  };
}
