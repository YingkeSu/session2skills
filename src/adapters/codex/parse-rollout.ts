import { readFileSync } from "node:fs";
import type {
  RawMessage,
  RawMessageInfo,
  RawPart,
  RawSessionMessages,
} from "../../normalize/raw-session.js";
import { OpenCodeAdapterError, toErrorMessage } from "../../shared/errors.js";
import type {
  CodexRolloutItem,
  CodexRolloutLine,
} from "./types.js";

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

    const parsedMessage = mapRolloutLineToMessage(rolloutLine.item, createdAt);
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
  item: CodexRolloutItem,
  createdAt: number,
): ParsedMessage | undefined {
  if (item.type === "event_msg") {
    return mapEventMessage(item.payload, createdAt);
  }
  if (item.type === "response_item") {
    return mapResponseItem(item.payload, createdAt);
  }
  return undefined;
}

function mapEventMessage(
  payload: Record<string, unknown>,
  createdAt: number,
): ParsedMessage | undefined {
  const type = payload.type;
  if (type !== "user_message") return undefined;

  const inner = payload.payload;
  const messageText =
    typeof inner === "object" && inner !== null
      ? readStringProperty(inner as Record<string, unknown>, "message")
      : undefined;

  return {
    info: { role: "user", createdAt },
    parts: [{ type: "text", text: messageText ?? "" }],
  };
}

function mapResponseItem(
  payload: Record<string, unknown>,
  createdAt: number,
): ParsedMessage | undefined {
  if (payload.type !== "message") return undefined;

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
  const itemValue = record.item;
  if (typeof itemValue !== "object" || itemValue === null) {
    throw new OpenCodeAdapterError(
      `Codex rollout line ${lineIndex + 1} in ${filePath} missing item object`,
    );
  }
  const itemRecord = itemValue as Record<string, unknown>;
  const itemType = itemRecord.type;
  if (typeof itemType !== "string") {
    throw new OpenCodeAdapterError(
      `Codex rollout line ${lineIndex + 1} in ${filePath} missing item.type string`,
    );
  }
  const itemPayload = itemRecord.payload;
  if (typeof itemPayload !== "object" || itemPayload === null) {
    throw new OpenCodeAdapterError(
      `Codex rollout line ${lineIndex + 1} in ${filePath} missing item.payload object`,
    );
  }
  return {
    timestamp,
    item: { type: itemType, payload: itemPayload as Record<string, unknown> },
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
