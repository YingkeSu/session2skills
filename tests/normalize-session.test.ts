import { describe, expect, it } from "vitest";

import { normalizeSession } from "../src/normalize/normalize-session.js";
import { sampleDiffs, sampleMessages, sampleSession } from "./fixtures/sample-session-input.js";

describe("normalizeSession", () => {
  it("preserves evidence and tool invocations from raw session input", () => {
    const normalized = normalizeSession({
      session: sampleSession,
      messages: sampleMessages,
      diff: sampleDiffs,
    });

    expect(normalized.messages).toHaveLength(1);
    expect(normalized.toolInvocations).toHaveLength(1);
    expect(normalized.updatedAt).toBe(2);
    expect(normalized.messages[0]?.evidence.sessionID).toBe("ses_fixture");
    expect(normalized.diffSummary?.filesChanged).toBe(1);
  });
});
