export type LlmRole = "system" | "user" | "assistant";

export type LlmMessage = {
  role: LlmRole;
  content: string;
  name?: string;
};

export type LlmModelRef = {
  model: string;
  version?: string;
};

export type LlmModelMetadata = LlmModelRef & {
  provider: string;
  displayName?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsTextGeneration: boolean;
  supportsStructuredGeneration: boolean;
};

export type LlmUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type LlmRetryPolicy = {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
};

export type LlmCallOptions = {
  timeoutMs?: number;
  retry?: Partial<LlmRetryPolicy>;
  signal?: AbortSignal;
};

export type LlmGenerationMetadata = {
  provider: string;
  model: string;
  version?: string;
  latencyMs: number;
  attempts: number;
  usage?: LlmUsage;
};

export type LlmGenerationRequestBase = {
  model: LlmModelRef;
  messages: readonly LlmMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  options?: LlmCallOptions;
};

export type LlmTextGenerationRequest = LlmGenerationRequestBase;

export type LlmStructuredOutputSchema<T> = {
  name: string;
  description?: string;
  schema?: Record<string, unknown>;
  parse: (value: unknown) => T;
};

export type LlmStructuredGenerationRequest<T> = LlmGenerationRequestBase & {
  schema: LlmStructuredOutputSchema<T>;
};

export type LlmTextGenerationResult = {
  text: string;
  finishReason?: string;
  metadata: LlmGenerationMetadata;
};

export type LlmStructuredGenerationResult<T> = {
  object: T;
  rawText: string;
  finishReason?: string;
  metadata: LlmGenerationMetadata;
};

export type TokenUsage = LlmUsage;
export type ModelConfig = LlmModelMetadata;
export type LLMResponse = LlmTextGenerationResult | LlmStructuredGenerationResult<unknown>;
