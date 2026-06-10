import { describe, expect, it } from "vitest";
import type { RawSession, RawSessionMessages } from "../src/normalize/raw-session.js";
import { normalizeSession } from "../src/normalize/normalize-session.js";

function makeSession(overrides?: Partial<RawSession>): RawSession {
  return {
    id: "ses_test",
    directory: "/tmp/project",
    title: "Test session",
    updatedAt: 1,
    ...overrides,
  };
}

function makeTextPart(id: string, text: string, type: string = "text") {
  return {
    id,
    sessionID: "ses_test",
    messageID: "msg_test",
    type,
    text,
  };
}

function makeStepPart(id: string, stepType: "step-start" | "step-finish", extra?: Record<string, unknown>) {
  return {
    id,
    sessionID: "ses_test",
    messageID: "msg_test",
    type: stepType,
    ...extra,
  };
}

function makeMessage(parts: RawSessionMessages[number]["parts"]): RawSessionMessages[number] {
  return {
    info: {
      id: "msg_test",
      sessionID: "ses_test",
      role: "assistant",
      createdAt: 1,
    },
    parts,
  };
}

describe("normalizeSession edge cases", () => {
  it("handles sessions with no messages", () => {
    const result = normalizeSession({
      session: makeSession(),
      messages: [],
    });

    expect(result.messages).toHaveLength(0);
    expect(result.toolInvocations).toHaveLength(0);
    expect(result.steps).toHaveLength(0);
  });

  it("handles step-start without matching step-finish", () => {
    const messages: RawSessionMessages = [
      makeMessage([
        makeStepPart("step_1_start", "step-start", { snapshot: "sha1" }),
        makeTextPart("part_1", "doing work"),
      ]),
    ];

    const result = normalizeSession({ session: makeSession(), messages });

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]!.startSnapshot).toBe("sha1");
    expect(result.steps[0]!.endSnapshot).toBeUndefined();
  });

  it("pairs step-start with next step-finish", () => {
    const messages: RawSessionMessages = [
      makeMessage([
        makeStepPart("step_1_start", "step-start", { snapshot: "sha1" }),
        makeStepPart("step_1_finish", "step-finish", {
          snapshot: "sha2",
          stepCost: 0.05,
          stepTokens: { input: 100, output: 50, reasoning: 10, cache: { read: 20, write: 5 } },
        }),
      ]),
    ];

    const result = normalizeSession({ session: makeSession(), messages });

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]!.startSnapshot).toBe("sha1");
    expect(result.steps[0]!.endSnapshot).toBe("sha2");
    expect(result.steps[0]!.cost).toBe(0.05);
  });

  it("handles multiple step pairs", () => {
    const messages: RawSessionMessages = [
      makeMessage([
        makeStepPart("s1_start", "step-start"),
        makeStepPart("s1_finish", "step-finish"),
        makeStepPart("s2_start", "step-start"),
      ]),
    ];

    const result = normalizeSession({ session: makeSession(), messages });

    expect(result.steps).toHaveLength(2);
  });

  it("drops step-finish that appears without a step-start", () => {
    const messages: RawSessionMessages = [
      makeMessage([
        makeStepPart("orphan_finish", "step-finish"),
      ]),
    ];

    const result = normalizeSession({ session: makeSession(), messages });

    expect(result.steps).toHaveLength(0);
  });

  it("preserves enriched fields from message info", () => {
    const messages: RawSessionMessages = [
      {
        info: {
          id: "msg_enriched",
          sessionID: "ses_test",
          role: "assistant",
          createdAt: 1,
          agent: "build",
          modelID: "claude-3-opus",
          providerID: "anthropic",
          cost: 0.12,
          tokens: { input: 1000, output: 500, reasoning: 200, cache: { read: 100, write: 50 } },
        },
        parts: [makeTextPart("part_text", "hello")],
      },
    ];

    const result = normalizeSession({ session: makeSession(), messages });

    expect(result.messages[0]!.agent).toBe("build");
    expect(result.messages[0]!.modelID).toBe("claude-3-opus");
    expect(result.messages[0]!.providerID).toBe("anthropic");
    expect(result.messages[0]!.cost).toBe(0.12);
    expect(result.messages[0]!.tokens?.input).toBe(1000);
  });

  it("respects maxToolOutputChars for tool output truncation", () => {
    const longOutput = "x".repeat(500);
    const messages: RawSessionMessages = [
      makeMessage([
        {
          id: "part_tool",
          sessionID: "ses_test",
          messageID: "msg_test",
          type: "tool",
          tool: "read",
          state: {
            status: "completed",
            output: longOutput,
            title: "Read",
          },
        },
      ]),
    ];

    const result = normalizeSession({ session: makeSession(), messages, maxToolOutputChars: 50 });
    const part = result.messages[0]!.parts[0]!;
    expect(part.text?.length).toBe(50);
  });

  it("handles session with parentID and agent", () => {
    const result = normalizeSession({
      session: makeSession({ parentID: "ses_parent", agent: "explore" }),
      messages: [],
    });

    expect(result.parentID).toBe("ses_parent");
    expect(result.agent).toBe("explore");
  });

  it("preserves incomplete step pair when consecutive step-start events arrive", () => {
    const messages: RawSessionMessages = [
      makeMessage([
        makeStepPart("step_A_start", "step-start", { snapshot: "shaA" }),
        makeStepPart("step_B_start", "step-start", { snapshot: "shaB" }),
        makeStepPart("step_B_finish", "step-finish", {
          snapshot: "shaB2",
          stepCost: 0.03,
        }),
      ]),
    ];

    const result = normalizeSession({ session: makeSession(), messages });

    expect(result.steps).toHaveLength(2);
    // Step A: incomplete (start only)
    expect(result.steps[0]!.startSnapshot).toBe("shaA");
    expect(result.steps[0]!.endSnapshot).toBeUndefined();
    // Step B: complete
    expect(result.steps[1]!.startSnapshot).toBe("shaB");
    expect(result.steps[1]!.endSnapshot).toBe("shaB2");
    expect(result.steps[1]!.cost).toBe(0.03);
  });
});
