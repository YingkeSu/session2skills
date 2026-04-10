import type {
  LlmModelMetadata,
  LlmModelRef,
  LlmStructuredGenerationRequest,
  LlmStructuredGenerationResult,
  LlmTextGenerationRequest,
  LlmTextGenerationResult,
} from "./types.js";

export interface LlmProvider {
  readonly provider: string;
  readonly defaultModel?: LlmModelRef;

  listModels(): readonly LlmModelMetadata[];
  generateText(request: LlmTextGenerationRequest): Promise<LlmTextGenerationResult>;
  generateStructured<T>(request: LlmStructuredGenerationRequest<T>): Promise<LlmStructuredGenerationResult<T>>;
}

export type LlmProviderRegistration = {
  provider: LlmProvider;
  models?: readonly LlmModelMetadata[];
  defaultModel?: LlmModelRef;
};

export type ResolvedLlmProvider = {
  provider: LlmProvider;
  model: LlmModelRef;
  metadata?: LlmModelMetadata;
};
