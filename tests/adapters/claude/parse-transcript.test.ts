import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseEntries, parseTranscriptFile, extractMeta } from "../../../src/adapters/claude/parse-transcript.js";
import {
  assistantRichLine,
  assistantTextLine,
  linesToJsonl,
  unknownTypeLine,
  userTextLine,
  userToolResultLine,
} from "../../fixtures/claude-fixtures.js";

function writeTempTranscript(name: string, content: string): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "claude-transcript-"));
  const filePath = join(dir, name);
  writeFileSync(filePath, content, "utf8");
  return { dir, path: filePath };
}

describe("parseEntries + extractMeta", () => {
  it("extracts cwd, model, timestamps, and firstPrompt from entries", () => {
    const raw = linesToJsonl(
      userTextLine({ text: "Refactor the auth module" }),
      assistantTextLine({ model: "claude-opus-4-7", text: "Sure." }),
    );
    const entries = parseEntries(raw);
    const meta = extractMeta(entries);

    expect(meta.cwd).toBe("/Users/alice/my-project");
    expect(meta.model).toBe("claude-opus-4-7");
    expect(meta.firstTimestamp).toBe(Date.parse("2026-05-20T14:30:00.000Z"));
    expect(meta.lastTimestamp).toBe(Date.parse("2026-05-20T14:30:01.000Z"));
    expect(meta.firstPrompt).toBe("Refactor the auth module");
  });

  it("skips blank and malformed lines without throwing", () => {
    const raw = [
      JSON.stringify(userTextLine({ text: "hi" })),
      "",
      "not json",
      JSON.stringify(assistantTextLine({ text: "hello" })),
    ].join("\n");
    const entries = parseEntries(raw);
    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe("user");
    expect(entries[1].type).toBe("assistant");
  });
});

describe("parseTranscriptFile", () => {
  it("maps a user text message to a user RawMessage with a text part", () => {
    const { dir, path } = writeTempTranscript(
      "s1.jsonl",
      linesToJsonl(userTextLine({ text: "Fix the bug" })),
    );
    try {
      const { messages } = parseTranscriptFile(path);
      expect(messages).toHaveLength(1);
      expect(messages[0].info.role).toBe("user");
      expect(messages[0].parts).toHaveLength(1);
      expect(messages[0].parts[0].type).toBe("text");
      expect(messages[0].parts[0].text).toBe("Fix the bug");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("maps assistant text and thinking blocks to text and reasoning parts", () => {
    const { dir, path } = writeTempTranscript(
      "s1.jsonl",
      linesToJsonl(
        assistantRichLine({ text: "Here is the fix.", thinking: "I should check auth.ts" }),
      ),
    );
    try {
      const { messages } = parseTranscriptFile(path);
      expect(messages).toHaveLength(1);
      const parts = messages[0].parts;
      expect(parts).toHaveLength(2);
      expect(parts[0].type).toBe("text");
      expect(parts[0].text).toBe("Here is the fix.");
      expect(parts[1].type).toBe("reasoning");
      expect(parts[1].text).toBe("I should check auth.ts");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("maps a tool_use block to a tool part and fills output from a later tool_result", () => {
    const { dir, path } = writeTempTranscript(
      "s1.jsonl",
      linesToJsonl(
        assistantRichLine({
          text: "Running tests.",
          toolUse: { id: "toolu_1", name: "Bash", input: { command: "npm test" } },
        }),
        userToolResultLine({ toolUseId: "toolu_1", resultText: "PASS src/foo.test.ts" }),
        assistantTextLine({ text: "Tests pass." }),
      ),
    );
    try {
      const { messages } = parseTranscriptFile(path);
      // A user entry that only carries a tool_result block produces no message;
      // its output is attached to the prior assistant tool_use part.
      expect(messages).toHaveLength(2);

      const assistantMsg = messages[0];
      expect(assistantMsg.info.role).toBe("assistant");
      const toolPart = assistantMsg.parts.find((p) => p.type === "tool");
      expect(toolPart).toBeDefined();
      expect(toolPart?.tool).toBe("Bash");
      expect(toolPart?.callID).toBe("toolu_1");
      expect(toolPart?.state?.input).toEqual({ command: "npm test" });
      expect(toolPart?.state?.output).toBe("PASS src/foo.test.ts");
      expect(toolPart?.state?.status).toBe("completed");

      const finalAssistant = messages[1];
      expect(finalAssistant.info.role).toBe("assistant");
      expect(finalAssistant.parts[0].type).toBe("text");
      expect(finalAssistant.parts[0].text).toBe("Tests pass.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("marks tool state as error when tool_result has is_error", () => {
    const { dir, path } = writeTempTranscript(
      "s1.jsonl",
      linesToJsonl(
        assistantRichLine({
          toolUse: { id: "toolu_err", name: "Bash", input: { command: "exit 1" } },
        }),
        userToolResultLine({ toolUseId: "toolu_err", resultText: "boom", isError: true }),
      ),
    );
    try {
      const { messages } = parseTranscriptFile(path);
      const toolPart = messages[0].parts.find((p) => p.type === "tool");
      expect(toolPart?.state?.status).toBe("error");
      expect(toolPart?.state?.error).toBe("boom");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("skips unknown entry types without throwing", () => {
    const { dir, path } = writeTempTranscript(
      "s1.jsonl",
      linesToJsonl(
        unknownTypeLine("future-event"),
        userTextLine({ text: "hi" }),
        unknownTypeLine("another-unknown"),
      ),
    );
    try {
      const { messages } = parseTranscriptFile(path);
      expect(messages).toHaveLength(1);
      expect(messages[0].info.role).toBe("user");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns empty messages for an empty file", () => {
    const { dir, path } = writeTempTranscript("s1.jsonl", "");
    try {
      const { messages } = parseTranscriptFile(path);
      expect(messages).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("produces stable, well-formed ids", () => {
    const { dir, path } = writeTempTranscript(
      "abc-123.jsonl",
      linesToJsonl(userTextLine({ sessionId: "abc-123", text: "hi" })),
    );
    try {
      const { messages } = parseTranscriptFile(path);
      const msg = messages[0];
      expect(msg.info.sessionID).toBe("abc-123");
      expect(msg.info.id).toBe("abc-123:0");
      expect(msg.parts[0].id).toBe("abc-123:0:0");
      expect(msg.parts[0].sessionID).toBe("abc-123");
      expect(msg.parts[0].messageID).toBe("abc-123:0");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws OpenCodeAdapterError when the file does not exist", async () => {
    const { OpenCodeAdapterError } = await import("../../../src/shared/errors.js");
    expect(() => parseTranscriptFile(join(tmpdir(), "definitely-missing.jsonl"))).toThrow(
      OpenCodeAdapterError,
    );
  });
});
