import { describe, expect, it } from "vitest";

import { OpenAiCompatibleProvider } from "../src/llm/openai-compatible.js";
import type { OpenAiCompatibleProviderConfig } from "../src/llm/openai-compatible.js";
import { LlmProviderError } from "../src/shared/errors.js";

// ---------------------------------------------------------------------------
// Mock fetch helpers
// ---------------------------------------------------------------------------

function mockResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response;
}

function chatCompletionResponse(
  content: string,
  options: { model?: string; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }; finish_reason?: string } = {},
): unknown {
  return {
    id: "chatcmpl-1",
    model: options.model ?? "test-model",
    choices: [{
      finish_reason: options.finish_reason ?? "stop",
      message: { content },
    }],
    usage: options.usage,
  };
}

function createProvider(fetchMock: typeof fetch, overrides: Partial<OpenAiCompatibleProviderConfig> = {}): OpenAiCompatibleProvider {
  return new OpenAiCompatibleProvider({
    provider: "test-provider",
    baseUrl: "https://api.test.com/v1",
    apiKey: "sk-test-key",
    fetch: fetchMock,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// generateText
// ---------------------------------------------------------------------------

describe("OpenAiCompatibleProvider.generateText", () => {
  it("returns text from successful response", async () => {
    const provider = createProvider(() =>
      Promise.resolve(mockResponse(200, chatCompletionResponse("Hello world"))),
    );

    const result = await provider.generateText({
      model: { model: "test-model" },
      messages: [{ role: "user", content: "Say hello" }],
    });

    expect(result.text).toBe("Hello world");
    expect(result.finishReason).toBe("stop");
  });

  it("includes usage metadata in response", async () => {
    const provider = createProvider(() =>
      Promise.resolve(mockResponse(200, chatCompletionResponse("text", {
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }))),
    );

    const result = await provider.generateText({
      model: { model: "test-model" },
      messages: [{ role: "user", content: "test" }],
    });

    expect(result.metadata.usage?.inputTokens).toBe(10);
    expect(result.metadata.usage?.outputTokens).toBe(5);
    expect(result.metadata.usage?.totalTokens).toBe(15);
  });

  it("throws LlmProviderError for empty response", async () => {
    const provider = createProvider(() =>
      Promise.resolve(mockResponse(200, chatCompletionResponse(""))),
    );

    await expect(provider.generateText({
      model: { model: "test-model" },
      messages: [{ role: "user", content: "test" }],
    })).rejects.toThrow(LlmProviderError);
  });

  it("handles array content responses", async () => {
    const body = {
      id: "chatcmpl-1",
      choices: [{
        finish_reason: "stop",
        message: {
          content: [{ type: "text", text: "Part 1" }, { type: "text", text: "Part 2" }],
        },
      }],
    };
    const provider = createProvider(() =>
      Promise.resolve(mockResponse(200, body)),
    );

    const result = await provider.generateText({
      model: { model: "test-model" },
      messages: [{ role: "user", content: "test" }],
    });

    expect(result.text).toBe("Part 1\nPart 2");
  });
});

// ---------------------------------------------------------------------------
// HTTP errors
// ---------------------------------------------------------------------------

describe("OpenAiCompatibleProvider HTTP errors", () => {
  it("throws retryable LlmProviderError for HTTP 429", async () => {
    const provider = createProvider(() =>
      Promise.resolve(mockResponse(429, { error: "rate limited" })),
    );

    try {
      await provider.generateText({
        model: { model: "test-model" },
        messages: [{ role: "user", content: "test" }],
      });
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(LlmProviderError);
      expect((error as LlmProviderError).retryable).toBe(true);
      expect((error as LlmProviderError).statusCode).toBe(429);
    }
  });

  it("throws retryable LlmProviderError for HTTP 500", async () => {
    const provider = createProvider(() =>
      Promise.resolve(mockResponse(500, "Internal Server Error")),
    );

    try {
      await provider.generateText({
        model: { model: "test-model" },
        messages: [{ role: "user", content: "test" }],
      });
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(LlmProviderError);
      expect((error as LlmProviderError).retryable).toBe(true);
      expect((error as LlmProviderError).statusCode).toBe(500);
    }
  });

  it("throws non-retryable LlmProviderError for HTTP 400", async () => {
    const provider = createProvider(() =>
      Promise.resolve(mockResponse(400, "Bad request")),
    );

    try {
      await provider.generateText({
        model: { model: "test-model" },
        messages: [{ role: "user", content: "test" }],
      });
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(LlmProviderError);
      expect((error as LlmProviderError).retryable).toBe(false);
      expect((error as LlmProviderError).statusCode).toBe(400);
    }
  });

  it("throws non-retryable LlmProviderError for HTTP 403", async () => {
    const provider = createProvider(() =>
      Promise.resolve(mockResponse(403, "Forbidden")),
    );

    try {
      await provider.generateText({
        model: { model: "test-model" },
        messages: [{ role: "user", content: "test" }],
      });
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(LlmProviderError);
      expect((error as LlmProviderError).retryable).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Network errors
// ---------------------------------------------------------------------------

describe("OpenAiCompatibleProvider network errors", () => {
  it("throws retryable LlmProviderError when fetch throws", async () => {
    const provider = createProvider(() => {
      throw new TypeError("fetch failed");
    });

    try {
      await provider.generateText({
        model: { model: "test-model" },
        messages: [{ role: "user", content: "test" }],
      });
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(LlmProviderError);
      expect((error as LlmProviderError).retryable).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// generateStructured
// ---------------------------------------------------------------------------

describe("OpenAiCompatibleProvider.generateStructured", () => {
  it("returns parsed object from structured response", async () => {
    const responseObject = { claims: [] };
    const provider = createProvider(() =>
      Promise.resolve(mockResponse(200, chatCompletionResponse(JSON.stringify(responseObject)))),
    );

    const result = await provider.generateStructured({
      model: { model: "test-model" },
      messages: [{ role: "user", content: "test" }],
      schema: {
        name: "test_schema",
        parse: (input: unknown) => input,
      },
    });

    expect(result.object).toEqual(responseObject);
    expect(result.rawText).toBe(JSON.stringify(responseObject));
  });

  it("parses JSON wrapped in markdown code fences", async () => {
    // Regression: some providers (e.g. Zhipu GLM) wrap structured JSON output in
    // ```json fences even when a json_schema response_format is requested.
    // parseJson must strip the fence or the whole harness stage fails.
    const responseObject = { claims: [{ id: "c1", text: "claim" }] };
    const fenced = "```json\n" + JSON.stringify(responseObject) + "\n```";
    const provider = createProvider(() =>
      Promise.resolve(mockResponse(200, chatCompletionResponse(fenced))),
    );

    const result = await provider.generateStructured({
      model: { model: "test-model" },
      messages: [{ role: "user", content: "test" }],
      schema: { name: "test_schema", parse: (input: unknown) => input },
    });

    expect(result.object).toEqual(responseObject);
  });

  it("parses JSON wrapped in a bare code fence", async () => {
    const responseObject = { ok: true };
    const fenced = "```\n" + JSON.stringify(responseObject) + "\n```";
    const provider = createProvider(() =>
      Promise.resolve(mockResponse(200, chatCompletionResponse(fenced))),
    );

    const result = await provider.generateStructured({
      model: { model: "test-model" },
      messages: [{ role: "user", content: "test" }],
      schema: { name: "test_schema", parse: (input: unknown) => input },
    });

    expect(result.object).toEqual(responseObject);
  });

  it("throws LlmProviderError for invalid JSON in structured response", async () => {
    const provider = createProvider(() =>
      Promise.resolve(mockResponse(200, chatCompletionResponse("not valid json"))),
    );

    try {
      await provider.generateStructured({
        model: { model: "test-model" },
        messages: [{ role: "user", content: "test" }],
        schema: { name: "test_schema", parse: (x: unknown) => x },
      });
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(LlmProviderError);
      expect((error as LlmProviderError).message).toContain("invalid JSON");
    }
  });
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

describe("OpenAiCompatibleProvider configuration", () => {
  it("sends API key as Bearer token", async () => {
    let capturedRequest: RequestInit | undefined;
    const provider = createProvider((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedRequest = init;
      return Promise.resolve(mockResponse(200, chatCompletionResponse("ok")));
    });

    await provider.generateText({
      model: { model: "test-model" },
      messages: [{ role: "user", content: "test" }],
    });

    expect(capturedRequest?.headers).toBeDefined();
    const headers = capturedRequest!.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-test-key");
  });

  it("uses preferJsonObject for response_format when configured", async () => {
    let capturedBody: string | undefined;
    const provider = createProvider((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return Promise.resolve(mockResponse(200, chatCompletionResponse('{"result":true}')));
    }, { preferJsonObject: true });

    await provider.generateStructured({
      model: { model: "test-model" },
      messages: [{ role: "user", content: "respond with json" }],
      schema: {
        name: "test_schema",
        schema: { type: "object", properties: { result: { type: "boolean" } } },
        parse: (x: unknown) => x,
      },
    });

    const parsed = JSON.parse(capturedBody!);
    expect(parsed.response_format).toEqual({ type: "json_object" });
  });
});
