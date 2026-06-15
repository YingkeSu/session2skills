import { describe, expect, it } from "vitest";

import { createPromptRegistry, PromptRegistryError } from "../src/llm/prompts/registry.js";
import type { PromptTemplate } from "../src/llm/prompts/registry.js";
import { allPrompts } from "../src/llm/prompts/definitions.js";

const testPrompt: PromptTemplate<{ result: string }> = {
  id: "test-prompt",
  version: "1.0.0",
  description: "A test prompt for registry validation.",
  systemPrompt: "You are a test assistant.",
  outputSchema: { type: "object", properties: { result: { type: "string" } }, required: ["result"] },
};

describe("PromptRegistry", () => {
  it("registers and retrieves a prompt by ID", () => {
    const registry = createPromptRegistry();
    registry.register(testPrompt);

    const retrieved = registry.get("test-prompt");
    expect(retrieved.id).toBe("test-prompt");
    expect(retrieved.version).toBe("1.0.0");
  });

  it("retrieves a specific version", () => {
    const registry = createPromptRegistry();
    registry.register(testPrompt);
    registry.register({
      ...testPrompt,
      version: "2.0.0",
      systemPrompt: "Updated system prompt.",
    });

    const v1 = registry.get("test-prompt", "1.0.0");
    const v2 = registry.get("test-prompt", "2.0.0");

    expect(v1.version).toBe("1.0.0");
    expect(v2.version).toBe("2.0.0");
  });

  it("returns latest version when no version specified", () => {
    const registry = createPromptRegistry();
    registry.register(testPrompt);
    registry.register({ ...testPrompt, version: "2.0.0" });
    registry.register({ ...testPrompt, version: "3.1.0" });

    const latest = registry.get("test-prompt");
    expect(latest.version).toBe("3.1.0");
  });

  it("lists all registered prompts", () => {
    const registry = createPromptRegistry();
    registry.register(testPrompt);
    registry.register({ ...testPrompt, id: "another-prompt", version: "1.2.0" });

    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.id).sort()).toEqual(["another-prompt", "test-prompt"]);
  });
});

describe("PromptRegistry rejects invalid registrations", () => {
  it("rejects missing prompt ID", () => {
    const registry = createPromptRegistry();

    expect(() =>
      registry.register({ ...testPrompt, id: "" }),
    ).toThrow(PromptRegistryError);
  });

  it("rejects missing prompt version", () => {
    const registry = createPromptRegistry();

    expect(() =>
      registry.register({ ...testPrompt, version: "" }),
    ).toThrow(PromptRegistryError);
  });

  it("rejects non-semver version strings", () => {
    const registry = createPromptRegistry();

    expect(() =>
      registry.register({ ...testPrompt, version: "latest" }),
    ).toThrow(PromptRegistryError);

    expect(() =>
      registry.register({ ...testPrompt, version: "1" }),
    ).toThrow(PromptRegistryError);

    expect(() =>
      registry.register({ ...testPrompt, version: "v1.0.0" }),
    ).toThrow(PromptRegistryError);
  });

  it("rejects duplicate ID+version registration", () => {
    const registry = createPromptRegistry();
    registry.register(testPrompt);

    expect(() =>
      registry.register({ ...testPrompt, description: "duplicate" }),
    ).toThrow(PromptRegistryError);
  });

  it("rejects retrieval of unregistered prompt ID", () => {
    const registry = createPromptRegistry();

    expect(() => registry.get("does-not-exist")).toThrow(PromptRegistryError);
  });

  it("rejects retrieval of unregistered version", () => {
    const registry = createPromptRegistry();
    registry.register(testPrompt);

    expect(() => registry.get("test-prompt", "99.0.0")).toThrow(PromptRegistryError);
  });
});

describe("Built-in prompt definitions", () => {
  it("all built-in prompts have valid semver versions", () => {
    for (const prompt of allPrompts) {
      expect(prompt.version).toMatch(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/);
      expect(prompt.id).toBeTruthy();
      expect(prompt.systemPrompt).toBeTruthy();
      expect(prompt.outputSchema).toBeTruthy();
    }
  });
});
