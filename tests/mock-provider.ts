import type {
  LlmModelMetadata,
  LlmModelRef,
  LlmProvider,
  LlmStructuredGenerationRequest,
  LlmStructuredGenerationResult,
  LlmTextGenerationRequest,
  LlmTextGenerationResult,
  ResolvedLlmProvider,
} from "../src/llm/index.js";

type MockMetadataOverrides = {
  attempts?: number;
  latencyMs?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  finishReason?: string;
  rawText?: string;
};

export type MockStructuredScenario =
  | ({ kind: "success"; object?: unknown } & MockMetadataOverrides)
  | ({ kind: "timeout"; message?: string } & MockMetadataOverrides)
  | ({ kind: "malformed-json"; message?: string } & MockMetadataOverrides)
  | ({ kind: "network-error"; message?: string } & MockMetadataOverrides)
  | ({ kind: "error"; error: Error } & MockMetadataOverrides);

export type MockTextScenario =
  | ({ kind: "success"; text: string } & MockMetadataOverrides)
  | ({ kind: "timeout"; message?: string } & MockMetadataOverrides)
  | ({ kind: "network-error"; message?: string } & MockMetadataOverrides)
  | ({ kind: "error"; error: Error } & MockMetadataOverrides);

export type MockLlmProviderOptions = {
  provider?: string;
  model?: string;
  version?: string;
  structuredScenarios?: Array<MockStructuredScenario>;
  textScenarios?: Array<MockTextScenario>;
};

const DEFAULT_PROVIDER = "mock-ci";
const DEFAULT_MODEL = "mock-model";

export class MockLlmProvider implements LlmProvider {
  readonly provider: string;
  readonly defaultModel: LlmModelRef;

  readonly structuredRequests: Array<LlmStructuredGenerationRequest<unknown>> = [];
  readonly textRequests: Array<LlmTextGenerationRequest> = [];

  private readonly version?: string;
  private readonly structuredScenarios: Array<MockStructuredScenario>;
  private readonly textScenarios: Array<MockTextScenario>;

  constructor(options: MockLlmProviderOptions = {}) {
    this.provider = options.provider ?? DEFAULT_PROVIDER;
    this.defaultModel = { model: options.model ?? DEFAULT_MODEL };
    this.version = options.version;
    this.structuredScenarios = [...(options.structuredScenarios ?? [])];
    this.textScenarios = [...(options.textScenarios ?? [])];
  }

  listModels(): readonly LlmModelMetadata[] {
    return [
      {
        provider: this.provider,
        model: this.defaultModel.model,
        version: this.version,
        displayName: this.defaultModel.model,
        supportsTextGeneration: true,
        supportsStructuredGeneration: true,
      },
    ];
  }

  enqueueStructuredScenario(scenario: MockStructuredScenario): void {
    this.structuredScenarios.push(scenario);
  }

  enqueueTextScenario(scenario: MockTextScenario): void {
    this.textScenarios.push(scenario);
  }

  toResolved(model: LlmModelRef = this.defaultModel): ResolvedLlmProvider {
    return {
      provider: this,
      model,
      metadata: this.listModels()[0],
    };
  }

  async generateText(request: LlmTextGenerationRequest): Promise<LlmTextGenerationResult> {
    this.textRequests.push(request);
    const scenario = this.textScenarios.shift() ?? { kind: "success", text: "", finishReason: "stop" };

    switch (scenario.kind) {
      case "success":
        return {
          text: scenario.text,
          finishReason: scenario.finishReason ?? "stop",
          metadata: buildMetadata(this, request.model, scenario),
        };
      case "timeout":
        throw buildTimeoutError(scenario.message ?? request.options?.timeoutMs);
      case "network-error":
        throw buildNamedError("MockNetworkError", scenario.message ?? "Mock network failure");
      case "error":
        throw scenario.error;
    }
  }

  async generateStructured<T>(
    request: LlmStructuredGenerationRequest<T>,
  ): Promise<LlmStructuredGenerationResult<T>> {
    this.structuredRequests.push(request as LlmStructuredGenerationRequest<unknown>);
    const scenario = this.structuredScenarios.shift() ?? { kind: "success", object: {} };

    switch (scenario.kind) {
      case "success": {
        const rawText = scenario.rawText ?? JSON.stringify(scenario.object ?? {});
        const parsed = request.schema.parse(scenario.object ?? JSON.parse(rawText));

        return {
          object: parsed,
          rawText,
          finishReason: scenario.finishReason ?? "stop",
          metadata: buildMetadata(this, request.model, scenario),
        };
      }

      case "malformed-json": {
        const rawText = scenario.rawText ?? '{"purpose": '; 
        JSON.parse(rawText);
        throw new Error(scenario.message ?? "Mock malformed JSON response");
      }

      case "timeout":
        throw buildTimeoutError(scenario.message ?? request.options?.timeoutMs);

      case "network-error":
        throw buildNamedError("MockNetworkError", scenario.message ?? "Mock network failure");

      case "error":
        throw scenario.error;
    }
  }
}

function buildMetadata(
  provider: MockLlmProvider,
  model: LlmModelRef,
  scenario: MockMetadataOverrides,
) {
  return {
    provider: provider.provider,
    model: model.model,
    version: model.version,
    latencyMs: scenario.latencyMs ?? 1,
    attempts: scenario.attempts ?? 1,
    usage: scenario.usage,
  };
}

function buildTimeoutError(timeout: number | string | undefined): Error {
  const message = typeof timeout === "number"
    ? `Mock timeout after ${timeout}ms`
    : typeof timeout === "string"
      ? timeout
      : "Mock timeout";

  return buildNamedError("MockTimeoutError", message);
}

function buildNamedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}
