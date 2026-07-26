import { afterEach, describe, expect, it } from "vitest";

import { CliUsageError } from "../../src/shared/errors.js";
import {
  DEFAULT_LLM_PROVIDER_ID,
  LLM_PROVIDER_PRESETS,
  resolveLlmProvider,
  resolveLlmProviderOptions,
  type LlmRunConfig,
} from "../../src/llm/selection.js";

const ENV_KEYS = [
  "SESSION2SKILLS_LLM_BASE_URL",
  "SESSION2SKILLS_LLM_MODEL",
  "SESSION2SKILLS_LLM_PROVIDER",
  "SESSION2SKILLS_LLM_API_KEY",
  "SESSION2SKILLS_LLM_MODEL_VERSION",
] as const;

function clearLlmEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe("LLM_PROVIDER_PRESETS", () => {
  it("includes the required OpenAI-compatible presets without model catalogs", () => {
    const ids = LLM_PROVIDER_PRESETS.map((preset) => preset.id);
    for (const expected of [
      "openai-compatible",
      "openai",
      "openrouter",
      "deepseek",
      "zhipuai",
      "ollama",
      "litellm",
    ]) {
      expect(ids).toContain(expected);
    }
    // Presets carry provider id / base URL only — no brittle model lists.
    for (const preset of LLM_PROVIDER_PRESETS) {
      expect(preset).not.toHaveProperty("models");
      expect(typeof preset.provider).toBe("string");
    }
  });
});

describe("resolveLlmProviderOptions", () => {
  afterEach(() => clearLlmEnv());

  it("throws CliUsageError when neither config nor env supplies baseUrl/model", () => {
    expect(() => resolveLlmProviderOptions()).toThrow(CliUsageError);
    expect(() => resolveLlmProviderOptions()).toThrow("SESSION2SKILLS_LLM_BASE_URL");
  });

  it("resolves from env vars with the default openai-compatible provider", () => {
    process.env.SESSION2SKILLS_LLM_BASE_URL = "https://api.example.com/v1";
    process.env.SESSION2SKILLS_LLM_MODEL = "gpt-test";

    const options = resolveLlmProviderOptions();

    expect(options).toMatchObject({
      provider: DEFAULT_LLM_PROVIDER_ID,
      baseUrl: "https://api.example.com/v1",
      model: "gpt-test",
      preferJsonObject: false,
    });
    expect(options.apiKey).toBeUndefined();
  });

  it("explicit config overrides env vars", () => {
    process.env.SESSION2SKILLS_LLM_BASE_URL = "https://env.example.com/v1";
    process.env.SESSION2SKILLS_LLM_MODEL = "env-model";
    process.env.SESSION2SKILLS_LLM_PROVIDER = "openai";

    const config: LlmRunConfig = {
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "anthropic/claude",
    };

    expect(resolveLlmProviderOptions(config)).toMatchObject({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "anthropic/claude",
    });
  });

  it("uses a preset base URL when an explicit provider is selected without baseUrl", () => {
    process.env.SESSION2SKILLS_LLM_BASE_URL = "https://env.example.com/v1";
    process.env.SESSION2SKILLS_LLM_MODEL = "env-model";

    expect(
      resolveLlmProviderOptions({ provider: "openai", model: "gpt-4o" }),
    ).toMatchObject({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
    });
  });

  it("can infer a preset base URL from SESSION2SKILLS_LLM_PROVIDER", () => {
    process.env.SESSION2SKILLS_LLM_PROVIDER = "openrouter";
    process.env.SESSION2SKILLS_LLM_MODEL = "anthropic/claude";

    expect(resolveLlmProviderOptions()).toMatchObject({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "anthropic/claude",
    });
  });

  it("deepseek and zhipuai default to preferJsonObject", () => {
    process.env.SESSION2SKILLS_LLM_BASE_URL = "https://api.deepseek.com/v1";
    process.env.SESSION2SKILLS_LLM_MODEL = "deepseek-chat";
    process.env.SESSION2SKILLS_LLM_PROVIDER = "deepseek";
    expect(resolveLlmProviderOptions().preferJsonObject).toBe(true);

    process.env.SESSION2SKILLS_LLM_PROVIDER = "zhipuai";
    expect(resolveLlmProviderOptions().preferJsonObject).toBe(true);
  });

  it("explicit preferJsonObject override wins over the provider default", () => {
    process.env.SESSION2SKILLS_LLM_BASE_URL = "https://api.deepseek.com/v1";
    process.env.SESSION2SKILLS_LLM_MODEL = "deepseek-chat";
    process.env.SESSION2SKILLS_LLM_PROVIDER = "deepseek";

    expect(
      resolveLlmProviderOptions({ preferJsonObject: false }).preferJsonObject,
    ).toBe(false);

    process.env.SESSION2SKILLS_LLM_PROVIDER = "openai";
    expect(
      resolveLlmProviderOptions({ preferJsonObject: true }).preferJsonObject,
    ).toBe(true);
  });

  it("resolves the API key from a literal value, then a named env var", () => {
    process.env.SESSION2SKILLS_LLM_BASE_URL = "https://api.example.com/v1";
    process.env.SESSION2SKILLS_LLM_MODEL = "gpt-test";
    process.env.MY_LLM_KEY = "secret-from-env";

    expect(resolveLlmProviderOptions({ apiKey: "literal-key" }).apiKey).toBe("literal-key");
    expect(resolveLlmProviderOptions({ apiKeyEnv: "MY_LLM_KEY" }).apiKey).toBe("secret-from-env");
    // Falls back to the default env var when nothing else is named.
    process.env.SESSION2SKILLS_LLM_API_KEY = "default-key";
    expect(resolveLlmProviderOptions().apiKey).toBe("default-key");

    delete process.env.MY_LLM_KEY;
  });

  it("forwards optional modelVersion and path", () => {
    process.env.SESSION2SKILLS_LLM_BASE_URL = "https://api.example.com/v1";
    process.env.SESSION2SKILLS_LLM_MODEL = "gpt-test";

    const options = resolveLlmProviderOptions({
      modelVersion: "2024-08-06",
      path: "/v2/chat/completions",
    });
    expect(options.modelVersion).toBe("2024-08-06");
    expect(options.path).toBe("/v2/chat/completions");
  });
});

describe("resolveLlmProvider", () => {
  afterEach(() => clearLlmEnv());

  it("builds a resolvable provider from explicit config", () => {
    const resolved = resolveLlmProvider({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
      apiKey: "sk-test",
    });
    expect(resolved.provider.provider).toBe("openai");
    expect(resolved.model.model).toBe("gpt-4o");
  });

  it("resolves from env with the default provider id", () => {
    process.env.SESSION2SKILLS_LLM_BASE_URL = "https://api.example.com/v1";
    process.env.SESSION2SKILLS_LLM_MODEL = "env-model";
    const resolved = resolveLlmProvider();
    expect(resolved.provider.provider).toBe(DEFAULT_LLM_PROVIDER_ID);
    expect(resolved.model.model).toBe("env-model");
  });
});
