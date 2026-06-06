import { describe, expect, it } from "vitest";

import { CliUsageError } from "../src/shared/errors.js";
import { LlmProviderRegistry } from "../src/llm/registry.js";
import type { LlmProvider, LlmProviderRegistration } from "../src/llm/provider.js";
import type { LlmModelMetadata } from "../src/llm/types.js";

function makeMockProvider(providerId: string, models: Array<{ model: string; version?: string }> = []): LlmProviderRegistration {
  const metadata: Array<LlmModelMetadata> = models.map((m) => ({
    ...m,
    provider: providerId,
    contextWindow: 4096,
    maxOutputTokens: 2048,
    supportsTextGeneration: true,
    supportsStructuredGeneration: true,
  }));
  const mockProvider: LlmProvider = {
    provider: providerId,
    async generateText() {
      return {
        text: "",
        finishReason: "stop",
        metadata: {
          provider: providerId,
          model: models[0]?.model ?? "test",
          latencyMs: 0,
          attempts: 1,
        },
      };
    },
    async generateStructured(request) {
      return {
        object: request.schema.parse({}),
        rawText: "{}",
        finishReason: "stop",
        metadata: {
          provider: providerId,
          model: models[0]?.model ?? "test",
          latencyMs: 0,
          attempts: 1,
        },
      };
    },
    listModels: () => metadata,
    defaultModel: models.length > 0 ? { model: models[0].model, version: models[0].version } : undefined,
  };
  return { provider: mockProvider, models: metadata };
}

describe("LlmProviderRegistry", () => {
  it("registers and resolves a provider", () => {
    const registry = new LlmProviderRegistry([makeMockProvider("test-provider", [{ model: "gpt-4" }])]);
    const resolved = registry.resolve("test-provider");
    expect(resolved.provider.provider).toBe("test-provider");
    expect(resolved.model.model).toBe("gpt-4");
  });

  it("rejects duplicate provider registration", () => {
    expect(() => new LlmProviderRegistry([
      makeMockProvider("dup"),
      makeMockProvider("dup"),
    ])).toThrow(CliUsageError);
  });

  it("returns undefined for non-existent provider via get()", () => {
    const registry = new LlmProviderRegistry();
    expect(registry.get("missing")).toBeUndefined();
  });

  it("throws for non-existent provider via require()", () => {
    const registry = new LlmProviderRegistry();
    expect(() => registry.require("missing")).toThrow(CliUsageError);
  });

  it("resolves with explicit model", () => {
    const registry = new LlmProviderRegistry([makeMockProvider("test", [{ model: "m1" }, { model: "m2" }])]);
    const resolved = registry.resolve("test", { model: "m2" });
    expect(resolved.model.model).toBe("m2");
  });

  it("throws when no model can be inferred", () => {
    const registry = new LlmProviderRegistry([makeMockProvider("test", [])]);
    expect(() => registry.resolve("test")).toThrow(CliUsageError);
  });

  it("lists registered providers", () => {
    const registry = new LlmProviderRegistry([makeMockProvider("a"), makeMockProvider("b")]);
    expect(registry.list()).toHaveLength(2);
    expect(registry.list().map((r) => r.provider.provider).sort()).toEqual(["a", "b"]);
  });
});
