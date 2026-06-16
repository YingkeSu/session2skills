import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseRolloutFile } from "../../../src/adapters/codex/parse-rollout.js";
import { OpenCodeAdapterError } from "../../../src/shared/errors.js";
import {
  CODEX_ASSISTANT_TS,
  CODEX_REASONING_TS,
  CODEX_THREAD_ID,
  CODEX_USER_TS,
  makeAgentEventMessageLine,
  makeAssistantMessageLine,
  makeFunctionCallLine,
  makeFunctionCallOutputLine,
  makeReasoningLine,
  makeSessionMetaLine,
  makeUnknownItemLine,
  makeUserMessageLine,
} from "../../fixtures/codex-fixtures.js";

const SESSION_ID = CODEX_THREAD_ID;
const USER_EPOCH = Date.parse(CODEX_USER_TS);
const ASSISTANT_EPOCH = Date.parse(CODEX_ASSISTANT_TS);
const REASONING_EPOCH = Date.parse(CODEX_REASONING_TS);

let tmpDir: string;
let rolloutPath: string;

function writeRollout(lines: Array<string>): string {
  writeFileSync(rolloutPath, lines.join("\n"), "utf8");
  return rolloutPath;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "codex-rollout-"));
  rolloutPath = join(tmpDir, "rollout-test.jsonl");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("parseRolloutFile", () => {
  it("maps a session_meta + user_message + response_item transcript to RawSessionMessages", () => {
    writeRollout([
      makeSessionMetaLine(),
      makeUserMessageLine("hello codex"),
      makeAssistantMessageLine("hi there"),
    ]);

    const messages = parseRolloutFile(rolloutPath, SESSION_ID);

    expect(messages).toHaveLength(2);

    const [user, assistant] = messages;

    expect(user.info.role).toBe("user");
    expect(user.info.sessionID).toBe(SESSION_ID);
    expect(user.info.createdAt).toBe(USER_EPOCH);
    expect(user.parts).toHaveLength(1);
    expect(user.parts[0]?.type).toBe("text");
    expect(user.parts[0]?.text).toBe("hello codex");
    expect(user.parts[0]?.sessionID).toBe(SESSION_ID);
    expect(user.parts[0]?.messageID).toBe(user.info.id);

    expect(assistant.info.role).toBe("assistant");
    expect(assistant.info.createdAt).toBe(ASSISTANT_EPOCH);
    expect(assistant.parts).toHaveLength(1);
    expect(assistant.parts[0]?.type).toBe("text");
    expect(assistant.parts[0]?.text).toBe("hi there");
  });

  it("skips session_meta / turn_context / compacted and unknown top-level types without throwing", () => {
    writeRollout([
      makeSessionMetaLine(),
      makeUnknownItemLine("compacted"),
      makeUnknownItemLine("turn_context"),
      makeUnknownItemLine("totally_made_up"),
      makeUserMessageLine("only user text survives"),
    ]);

    const messages = parseRolloutFile(rolloutPath, SESSION_ID);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.info.role).toBe("user");
    expect(messages[0]?.parts[0]?.text).toBe("only user text survives");
  });

  it("maps event_msg agent_message to an assistant text message", () => {
    writeRollout([makeAgentEventMessageLine("agent says hi")]);

    const messages = parseRolloutFile(rolloutPath, SESSION_ID);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.info.role).toBe("assistant");
    expect(messages[0]?.parts[0]?.type).toBe("text");
    expect(messages[0]?.parts[0]?.text).toBe("agent says hi");
  });

  it("maps response_item reasoning into a reasoning part, skipping it when no text", () => {
    writeRollout([
      makeReasoningLine("thinking about the plan"),
      makeAssistantMessageLine("final answer"),
    ]);

    const messages = parseRolloutFile(rolloutPath, SESSION_ID);
    expect(messages).toHaveLength(2);

    const [reasoning, answer] = messages;
    expect(reasoning.info.role).toBe("assistant");
    expect(reasoning.info.createdAt).toBe(REASONING_EPOCH);
    expect(reasoning.parts).toHaveLength(1);
    expect(reasoning.parts[0]?.type).toBe("reasoning");
    expect(reasoning.parts[0]?.text).toBe("thinking about the plan");

    expect(answer.parts[0]?.type).toBe("text");
  });

  it("skips reasoning lines whose summary/content carry no extractable text", () => {
    const line = JSON.stringify({
      timestamp: CODEX_REASONING_TS,
      type: "response_item",
      payload: { type: "reasoning", summary: [], content: null },
    });
    writeFileSync(rolloutPath, line + "\n" + makeUserMessageLine("kept"), "utf8");

    const messages = parseRolloutFile(rolloutPath, SESSION_ID);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.info.role).toBe("user");
  });

  it("skips function_call and function_call_output without throwing", () => {
    writeRollout([
      makeFunctionCallLine(),
      makeFunctionCallOutputLine(),
      makeUserMessageLine("survives"),
    ]);

    const messages = parseRolloutFile(rolloutPath, SESSION_ID);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.info.role).toBe("user");
  });

  it("returns an empty array for an empty file", () => {
    writeFileSync(rolloutPath, "", "utf8");
    expect(parseRolloutFile(rolloutPath, SESSION_ID)).toEqual([]);
  });

  it("returns an empty array for a file with only blank lines", () => {
    writeFileSync(rolloutPath, "\n\n   \n", "utf8");
    expect(parseRolloutFile(rolloutPath, SESSION_ID)).toEqual([]);
  });

  it("produces stable, well-formed message and part ids", () => {
    writeRollout([
      makeUserMessageLine("q1"),
      makeAssistantMessageLine("a1 with two parts"),
      makeUserMessageLine("q2"),
    ]);

    const messages = parseRolloutFile(rolloutPath, SESSION_ID);

    expect(messages.map((m) => m.info.id)).toEqual([
      `${SESSION_ID}:0`,
      `${SESSION_ID}:1`,
      `${SESSION_ID}:2`,
    ]);

    const firstPart = messages[0]?.parts[0];
    expect(firstPart?.id).toBe(`${SESSION_ID}:0:0`);
    expect(firstPart?.messageID).toBe(`${SESSION_ID}:0`);
    expect(firstPart?.sessionID).toBe(SESSION_ID);
  });

  it("maps response_item content with input_text and output_text entries to text parts", () => {
    const line = JSON.stringify({
      timestamp: CODEX_ASSISTANT_TS,
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [
          { type: "input_text", text: "remembered context" },
          { type: "output_text", text: "final answer" },
          { type: "input_image", url: "ignored" },
          { type: "output_text", text: "second chunk" },
        ],
      },
    });
    writeFileSync(rolloutPath, line + "\n", "utf8");

    const messages = parseRolloutFile(rolloutPath, SESSION_ID);
    expect(messages).toHaveLength(1);
    const parts = messages[0]?.parts ?? [];
    expect(parts.map((p) => p.text)).toEqual([
      "remembered context",
      "final answer",
      "second chunk",
    ]);
  });

  it("maps response_item with role user to a user message", () => {
    writeRollout([makeAssistantMessageLine("echoed", undefined, "user")]);

    const messages = parseRolloutFile(rolloutPath, SESSION_ID);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.info.role).toBe("user");
  });

  it("throws OpenCodeAdapterError on malformed JSON lines", () => {
    writeFileSync(rolloutPath, "{not valid json\n", "utf8");
    expect(() => parseRolloutFile(rolloutPath, SESSION_ID)).toThrow(
      OpenCodeAdapterError,
    );
  });

  it("throws OpenCodeAdapterError when the rollout file is missing", () => {
    const missing = join(tmpDir, "does-not-exist.jsonl");
    expect(() => parseRolloutFile(missing, SESSION_ID)).toThrow(
      OpenCodeAdapterError,
    );
  });

  it("throws OpenCodeAdapterError when a line lacks a timestamp", () => {
    writeFileSync(
      rolloutPath,
      JSON.stringify({ type: "event_msg", payload: {} }) + "\n",
      "utf8",
    );
    expect(() => parseRolloutFile(rolloutPath, SESSION_ID)).toThrow(
      OpenCodeAdapterError,
    );
  });

  it("throws OpenCodeAdapterError when a line lacks a top-level type string", () => {
    writeFileSync(
      rolloutPath,
      JSON.stringify({ timestamp: CODEX_USER_TS, payload: {} }) + "\n",
      "utf8",
    );
    expect(() => parseRolloutFile(rolloutPath, SESSION_ID)).toThrow(
      OpenCodeAdapterError,
    );
  });

  it("throws OpenCodeAdapterError when a line lacks a payload object", () => {
    writeFileSync(
      rolloutPath,
      JSON.stringify({ timestamp: CODEX_USER_TS, type: "event_msg" }) + "\n",
      "utf8",
    );
    expect(() => parseRolloutFile(rolloutPath, SESSION_ID)).toThrow(
      OpenCodeAdapterError,
    );
  });
});
