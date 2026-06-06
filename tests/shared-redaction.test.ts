import { describe, expect, it } from "vitest";

import {
  containsSecretMaterial,
  redactSecretsDeep,
  redactSecretsFromString,
  REDACTED_SECRET,
} from "../src/shared/redaction.js";

describe("redaction", () => {
  it("redacts OpenAI-style tokens", () => {
    const result = redactSecretsFromString("Use sk-abc123456789XYZ for this request");
    expect(result).toBe(`Use ${REDACTED_SECRET} for this request`);
  });

  it("redacts sensitive environment assignments", () => {
    const result = redactSecretsFromString("SESSION2SKILLS_LLM_API_KEY=sk-secretvalue\nMODEL=gpt-4o");
    expect(result).toBe(`SESSION2SKILLS_LLM_API_KEY=${REDACTED_SECRET}\nMODEL=gpt-4o`);
  });

  it("redacts nested sensitive keys", () => {
    const result = redactSecretsDeep({
      auth: {
        apiKey: "secret-value",
        model: "gpt-4o",
      },
    });

    expect(result).toEqual({
      auth: {
        apiKey: REDACTED_SECRET,
        model: "gpt-4o",
      },
    });
  });

  it("redacts quoted JSON secret properties in raw text", () => {
    const result = redactSecretsFromString("{\"secret\":\"abc123\"}");
    expect(result).toBe(`{"secret":"${REDACTED_SECRET}"}`);
  });

  it("detects secret material recursively", () => {
    expect(containsSecretMaterial({ env: "OPENAI_API_KEY=sk-secretvalue" })).toBe(true);
    expect(containsSecretMaterial({ model: "gpt-4o", totalTokens: 20 })).toBe(false);
  });
});
