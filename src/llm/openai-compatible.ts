import { LlmProviderError, toErrorMessage } from "../shared/errors.js";

import { runWithRetry } from "./retry.js";
import type { LlmProvider } from "./provider.js";
import type {
  LlmCallOptions,
  LlmModelMetadata,
  LlmModelRef,
  LlmStructuredGenerationRequest,
  LlmStructuredGenerationResult,
  LlmTextGenerationRequest,
  LlmTextGenerationResult,
} from "./types.js";

export type OpenAiCompatibleProviderConfig = {
  provider: string;
  baseUrl: string;
  apiKey?: string;
  defaultModel?: LlmModelRef;
  models?: readonly LlmModelMetadata[];
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
  retry?: LlmCallOptions["retry"];
  fetch?: typeof fetch;
  path?: string;
  /** When true, use `response_format: { type: "json_object" }` instead of `json_schema`. */
  preferJsonObject?: boolean;
};

type OpenAiCompatibleChatCompletionRequest = {
  model: string;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
    name?: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  response_format?:
    | { type: "json_object" }
    | {
        type: "json_schema";
        json_schema: {
          name: string;
          description?: string;
          schema: Record<string, unknown>;
          strict: true;
        };
      };
};

type OpenAiCompatibleChatCompletionResponse = {
  id?: string;
  model?: string;
  system_fingerprint?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | Array<{ type?: string; text?: string }> | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly provider: string;
  readonly defaultModel?: LlmModelRef;

  private readonly fetchImplementation: typeof fetch;
  private readonly models: readonly LlmModelMetadata[];

  constructor(private readonly config: OpenAiCompatibleProviderConfig) {
    this.provider = config.provider;
    this.defaultModel = config.defaultModel;
    this.fetchImplementation = config.fetch ?? fetch;
    this.models = config.models ?? [];
  }

  listModels(): readonly LlmModelMetadata[] {
    return this.models;
  }

  async generateText(request: LlmTextGenerationRequest): Promise<LlmTextGenerationResult> {
    const startedAt = Date.now();
    const { value: response, attempts } = await runWithRetry({
      operation: async () => this.requestCompletion(request),
      retry: { ...this.config.retry, ...request.options?.retry },
    });

    const choice = response.choices?.[0];
    const text = extractMessageText(choice?.message?.content);
    if (!text) {
      throw new LlmProviderError("LLM provider returned an empty text response.", {
        provider: this.provider,
      });
    }

    const resolvedModel = findConfiguredModel(this.models, request.model);

    return {
      text,
      finishReason: choice?.finish_reason,
      metadata: {
        provider: this.provider,
        model: response.model ?? request.model.model,
        version: request.model.version ?? resolvedModel?.version ?? response.system_fingerprint,
        latencyMs: Date.now() - startedAt,
        attempts,
        usage: mapUsage(response.usage),
      },
    };
  }

  async generateStructured<T>(
    request: LlmStructuredGenerationRequest<T>,
  ): Promise<LlmStructuredGenerationResult<T>> {
    const startedAt = Date.now();
    const { value: response, attempts } = await runWithRetry({
      operation: async () => this.requestCompletion(request),
      retry: { ...this.config.retry, ...request.options?.retry },
    });

    const choice = response.choices?.[0];
    const rawText = extractMessageText(choice?.message?.content);
    if (!rawText) {
      throw new LlmProviderError("LLM provider returned an empty structured response.", {
        provider: this.provider,
      });
    }

    const parsed = parseJson(rawText, this.provider);
    const resolvedModel = findConfiguredModel(this.models, request.model);

    return {
      object: request.schema.parse(parsed),
      rawText,
      finishReason: choice?.finish_reason,
      metadata: {
        provider: this.provider,
        model: response.model ?? request.model.model,
        version: request.model.version ?? resolvedModel?.version ?? response.system_fingerprint,
        latencyMs: Date.now() - startedAt,
        attempts,
        usage: mapUsage(response.usage),
      },
    };
  }

  private async requestCompletion(
    request: LlmTextGenerationRequest | LlmStructuredGenerationRequest<unknown>,
  ): Promise<OpenAiCompatibleChatCompletionResponse> {
    const { signal, cleanup } = createAbortController(
      request.options?.timeoutMs ?? this.config.timeoutMs,
      request.options?.signal,
    );

    try {
      const response = await this.fetchImplementation(buildUrl(this.config), {
        method: "POST",
        headers: buildHeaders(this.config),
        body: JSON.stringify(buildRequestBody(request, this.config)),
        signal,
      });

      if (!response.ok) {
        throw await createHttpError(this.provider, response);
      }

      return (await response.json()) as OpenAiCompatibleChatCompletionResponse;
    } catch (error) {
      if (error instanceof LlmProviderError) {
        throw error;
      }

      throw toLlmProviderError(this.provider, error);
    } finally {
      cleanup();
    }
  }
}

function buildRequestBody(
  request: LlmTextGenerationRequest | LlmStructuredGenerationRequest<unknown>,
  config: OpenAiCompatibleProviderConfig,
): OpenAiCompatibleChatCompletionRequest {
  const body: OpenAiCompatibleChatCompletionRequest = {
    model: request.model.model,
    messages: request.messages.map((message) => ({
      role: message.role,
      content: message.content,
      ...(message.name ? { name: message.name } : {}),
    })),
  };

  if (request.temperature !== undefined) {
    body.temperature = request.temperature;
  }

  if (request.maxOutputTokens !== undefined) {
    body.max_tokens = request.maxOutputTokens;
  }

  if ("schema" in request) {
    if (config.preferJsonObject || !request.schema.schema) {
      body.response_format = { type: "json_object" };
      body.messages = ensureJsonHint(body.messages);
    } else {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: request.schema.name,
          description: request.schema.description,
          schema: request.schema.schema,
          strict: true,
        },
      };
    }
  }

  return body;
}

function ensureJsonHint(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string; name?: string }>,
): typeof messages {
  const hasJson = messages.some((m) => /\bjson\b/i.test(m.content));
  if (hasJson) {
    return messages;
  }
  return [
    ...messages,
    { role: "user" as const, content: "Respond with valid JSON only. No markdown fences, no commentary." },
  ];
}

function buildHeaders(config: OpenAiCompatibleProviderConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...config.defaultHeaders,
  };

  if (config.apiKey) {
    headers.authorization = `Bearer ${config.apiKey}`;
  }

  return headers;
}

function buildUrl(config: OpenAiCompatibleProviderConfig): string {
  const trimmedBaseUrl = config.baseUrl.replace(/\/+$/, "");
  const path = config.path ?? "/chat/completions";
  return `${trimmedBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function createAbortController(timeoutMs: number | undefined, parentSignal?: AbortSignal): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const onAbort = (): void => {
    controller.abort(parentSignal?.reason);
  };

  if (parentSignal?.aborted) {
    controller.abort(parentSignal.reason);
  } else if (parentSignal) {
    parentSignal.addEventListener("abort", onAbort, { once: true });
  }

  const timeout =
    timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          controller.abort(new Error(`LLM request timed out after ${timeoutMs}ms.`));
        }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }

      parentSignal?.removeEventListener("abort", onAbort);
    },
  };
}

async function createHttpError(provider: string, response: Response): Promise<LlmProviderError> {
  const body = await response.text();
  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;

  return new LlmProviderError(
    `LLM provider request failed with status ${response.status}: ${body || response.statusText}`,
    {
      provider,
      statusCode: response.status,
      retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      retryAfterMs: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : undefined,
    },
  );
}

function toLlmProviderError(provider: string, error: unknown): LlmProviderError {
  if (isAbortError(error)) {
    return new LlmProviderError(toErrorMessage(error), {
      provider,
      retryable: true,
      cause: error,
    });
  }

  return new LlmProviderError(`LLM provider request failed: ${toErrorMessage(error)}`, {
    provider,
    retryable: true,
    cause: error,
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function extractMessageText(content: string | Array<{ type?: string; text?: string }> | null | undefined): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text?.trim() ?? "")
    .join("\n")
    .trim();
}

function parseJson(text: string, provider: string): unknown {
  try {
    return JSON.parse(stripCodeFences(text));
  } catch (error) {
    throw new LlmProviderError("LLM provider returned invalid JSON.", {
      provider,
      cause: error,
    });
  }
}

/**
 * Some OpenAI-compatible providers (e.g. Zhipu GLM) wrap JSON output in markdown
 * code fences (```json ... ```) even when a json_schema/json_object response
 * format is requested. Strip a single surrounding fence so the payload still
 * parses; leave anything else untouched.
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = /^```[^\n]*\n([\s\S]*?)\n?```[ \t]*$/.exec(trimmed);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function findConfiguredModel(
  models: readonly LlmModelMetadata[],
  target: LlmModelRef,
): LlmModelMetadata | undefined {
  return models.find((model) => {
    if (model.model !== target.model) {
      return false;
    }

    if (target.version && model.version && model.version !== target.version) {
      return false;
    }

    return true;
  });
}

function mapUsage(
  usage:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }
    | undefined,
) {
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}
