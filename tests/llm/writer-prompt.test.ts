import { describe, it, expect } from "vitest";
import { harnessWriterPrompt } from "../../src/llm/prompts/definitions.js";

describe("harnessWriterPrompt system prompt", () => {
  it("includes grounding density instructions", () => {
    expect(harnessWriterPrompt.systemPrompt).toContain(
      "When evidence excerpts are provided for a claim, anchor each directive to the observed pattern.",
    );
    expect(harnessWriterPrompt.systemPrompt).toContain(
      "Prefer behavioral translations over abstract labels",
    );
  });
});
