import { readFileSync } from "node:fs";
import type {
  RawMessage,
  RawMessageInfo,
  RawPart,
  RawSessionMessages,
} from "../../normalize/raw-session.js";
import { OpenCodeAdapterError, toErrorMessage } from "../../shared/errors.js";
import type { CodexRolloutLine } from "./types.js";

type ParsedMessage = {
  info: Omit<RawMessageInfo, "id" | "sessionID">;
  parts: Array<Omit<RawPart, "id" | "sessionID" | "messageID">>;
};

export function parseRolloutFile(
  filePath: string,
  sessionId: string,
): RawSessionMessages {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new OpenCodeAdapterError(
      `Failed to read Codex rollout file ${filePath}: ${toErrorMessage(error)}`,
      { cause: error },
    );
  }

  const lines = raw.split("\n");
  const messages: RawSessionMessages = [];
  let messageIndex = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineText = lines[lineIndex];
    if (!lineText) continue;
    if (!lineText.trim()) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(lineText);
    } catch (error) {
      throw new OpenCodeAdapterError(
        `Malformed JSON at ${filePath}:${lineIndex + 1}: ${toErrorMessage(error)}`,
        { cause: error },
      );
    }

    const rolloutLine = narrowRolloutLine(parsed, filePath, lineIndex);
    const createdAt = parseTimestamp(rolloutLine.timestamp, filePath, lineIndex);

    const parsedMessage = mapRolloutLineToMessage(rolloutLine, createdAt);
    if (!parsedMessage) continue;

    const messageID = `${sessionId}:${messageIndex}`;
    const info: RawMessageInfo = {
      ...parsedMessage.info,
      id: messageID,
      sessionID: sessionId,
    };
    const parts: Array<RawPart> = parsedMessage.parts.map((part, partIndex) => ({
      ...part,
      id: `${messageID}:${partIndex}`,
      sessionID: sessionId,
      messageID,
    }));

    messages.push({ info, parts });
    messageIndex += 1;
  }

  return messages;
}

function mapRolloutLineToMessage(
  line: CodexRolloutLine,
  createdAt: number,
): ParsedMessage | undefined {
  if (line.type === "event_msg") {
    return mapEventMessage(line.payload, createdAt);
  }
  if (line.type === "response_item") {
    return mapResponseItem(line.payload, createdAt);
  }
  return undefined;
}

function mapEventMessage(
  payload: Record<string, unknown>,
  createdAt: number,
): ParsedMessage | undefined {
  const type = payload.type;
  if (type === "user_message") {
    return {
      info: { role: "user", createdAt },
      parts: [{ type: "text", text: readStringProperty(payload, "message") ?? "" }],
    };
  }
  if (type === "agent_message") {
    return {
      info: { role: "assistant", createdAt },
      parts: [{ type: "text", text: readStringProperty(payload, "message") ?? "" }],
    };
  }
  return undefined;
}

function mapResponseItem(
  payload: Record<string, unknown>,
  createdAt: number,
): ParsedMessage | undefined {
  const type = payload.type;
  if (type === "message") {
    return mapMessagePayload(payload, createdAt);
  }
  if (type === "reasoning") {
    return mapReasoningPayload(payload, createdAt);
  }
  return undefined;
}

function mapMessagePayload(
  payload: Record<string, unknown>,
  createdAt: number,
): ParsedMessage | undefined {
  const role = readStringProperty(payload, "role");
  if (!role) return undefined;

  const content = payload.content;
  if (!Array.isArray(content)) return undefined;

  const parts: Array<ParsedMessage["parts"][number]> = [];
  for (const entry of content) {
    if (typeof entry !== "object" || entry === null) continue;
    const entryRecord = entry as Record<string, unknown>;
    const entryType = entryRecord.type;
    if (entryType !== "input_text" && entryType !== "output_text") continue;
    const text = readStringProperty(entryRecord, "text");
    parts.push({ type: "text", text: text ?? "" });
  }

  return {
    info: { role, createdAt },
    parts,
  };
}

function mapReasoningPayload(
  payload: Record<string, unknown>,
  createdAt: number,
): ParsedMessage | undefined {
  const text = joinTextArray(payload, "summary") ?? joinTextArray(payload, "content");
  if (text === undefined) return undefined;

  return {
    info: { role: "assistant", createdAt },
    parts: [{ type: "reasoning", text }],
  };
}

function joinTextArray(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  if (!Array.isArray(value)) return undefined;

  const collected: Array<string> = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const text = readStringProperty(entry as Record<string, unknown>, "text");
    if (text) collected.push(text);
  }
  return collected.length > 0 ? collected.join("\n") : undefined;
}

function readStringProperty(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function narrowRolloutLine(
  value: unknown,
  filePath: string,
  lineIndex: number,
): CodexRolloutLine {
  if (typeof value !== "object" || value === null) {
    throw new OpenCodeAdapterError(
      `Codex rollout line ${lineIndex + 1} in ${filePath} is not an object`,
    );
  }
  const record = value as Record<string, unknown>;

  const timestamp = record.timestamp;
  if (typeof timestamp !== "string") {
    throw new OpenCodeAdapterError(
      `Codex rollout line ${lineIndex + 1} in ${filePath} missing string timestamp`,
    );
  }

  const type = record.type;
  if (typeof type !== "string") {
    throw new OpenCodeAdapterError(
      `Codex rollout line ${lineIndex + 1} in ${filePath} missing string type`,
    );
  }

  const payload = record.payload;
  if (typeof payload !== "object" || payload === null) {
    throw new OpenCodeAdapterError(
      `Codex rollout line ${lineIndex + 1} in ${filePath} missing payload object`,
    );
  }

  return {
    timestamp,
    type,
    payload: payload as Record<string, unknown>,
  };
}

function parseTimestamp(
  timestamp: string,
  filePath: string,
  lineIndex: number,
): number {
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) {
    throw new OpenCodeAdapterError(
      `Codex rollout line ${lineIndex + 1} in ${filePath} has unparseable timestamp: ${timestamp}`,
    );
  }
  return ms;
}
