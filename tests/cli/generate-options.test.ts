import { describe, expect, it } from "vitest";

import { buildLlmConfigFromOptions } from "../../src/cli/commands/generate.js";

/**
 * Minimal `GenerateOptions` seed: only the LLM-related fields vary between
 * cases, so the rest are held at their CLI defaults. The full option type is
 * not exported, but TS checks the call structurally.
 */
const baseOptions = {
  recent: 10,
  force: false,
  tone: "balanced" as const,
  template: "claude-skill" as const,
  skillType: "workflow" as const,
  evidenceBudget: 160000,
  evidenceMaxChars: 5000,
  evidenceMaxItems: 3000,
};

describe("buildLlmConfigFromOptions", () => {
  it("returns undefined when no LLM option is supplied (keeps env default)", () => {
    expect(buildLlmConfigFromOptions(baseOptions)).toBeUndefined();
  });

  it("maps provider/baseUrl/model into the config", () => {
    const config = buildLlmConfigFromOptions({
      ...baseOptions,
      llmProvider: "openai",
      llmBaseUrl: "https://api.openai.com/v1",
      llmModel: "gpt-4o",
    });
    expect(config).toEqual({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
    });
  });

  it("prefers apiKeyEnv over the inline key for documented examples", () => {
    const config = buildLlmConfigFromOptions({
      ...baseOptions,
      llmApiKeyEnv: "OPENAI_API_KEY",
    });
    expect(config).toEqual({ apiKeyEnv: "OPENAI_API_KEY" });
  });

  it("forwards inline apiKey, modelVersion, path, and preferJsonObject", () => {
    const config = buildLlmConfigFromOptions({
      ...baseOptions,
      llmApiKey: "sk-local",
      llmModelVersion: "2024-08-06",
      llmPath: "/v2/chat/completions",
      preferJsonObject: true,
    });
    expect(config).toEqual({
      apiKey: "sk-local",
      modelVersion: "2024-08-06",
      path: "/v2/chat/completions",
      preferJsonObject: true,
    });
  });

  it("lets preferJsonObject=false disable the provider default", () => {
    const config = buildLlmConfigFromOptions({
      ...baseOptions,
      llmProvider: "deepseek",
      preferJsonObject: false,
    });
    expect(config).toEqual({ provider: "deepseek", preferJsonObject: false });
  });
});
