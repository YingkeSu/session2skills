export const HYBRID_LLM_ENV_REQUIRED =
  "Hybrid mode requires SESSION2SKILLS_LLM_BASE_URL and SESSION2SKILLS_LLM_MODEL environment variables.";

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

export class OpenCodeAdapterError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OpenCodeAdapterError";
  }
}

export class LlmProviderError extends Error {
  readonly provider?: string;
  readonly statusCode?: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    options?: {
      cause?: unknown;
      provider?: string;
      statusCode?: number;
      retryable?: boolean;
      retryAfterMs?: number;
    },
  ) {
    super(message, options);
    this.name = "LlmProviderError";
    this.provider = options?.provider;
    this.statusCode = options?.statusCode;
    this.retryable = options?.retryable ?? false;
    this.retryAfterMs = options?.retryAfterMs;
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
