import { CliUsageError, HYBRID_LLM_ENV_REQUIRED } from "../shared/errors.js";

import { LlmProviderRegistry } from "./registry.js";
import { OpenAiCompatibleProvider } from "./openai-compatible.js";
import type { ResolvedLlmProvider } from "./provider.js";

/**
 * Default provider id used when neither the run config nor
 * `SESSION2SKILLS_LLM_PROVIDER` names one. Keeps the historical
 * "openai-compatible" identity for traces and registry lookup.
 */
export const DEFAULT_LLM_PROVIDER_ID = "openai-compatible";

/** Default env var consulted for the API key when none is supplied. */
export const DEFAULT_LLM_API_KEY_ENV = "SESSION2SKILLS_LLM_API_KEY";

/**
 * Serializable LLM selection/config. Safe to pass through HTTP request bodies
 * and worker stdin. The optional {@link LlmRunConfig.apiKey} is a secret:
 * callers must never persist it to run artifacts, progress files, logs, or
 * trace files. Progress files deliberately do not carry this config at all —
 * `llmConfig` crosses the fork boundary via stdin only.
 */
export type LlmRunConfig = {
  /** Provider id, e.g. "openai", "deepseek", or "openai-compatible". */
  provider?: string;
  /** OpenAI-compatible base URL, e.g. "https://api.openai.com/v1". */
  baseUrl?: string;
  /** Model identifier, e.g. "gpt-4o". */
  model?: string;
  /** Optional model version label. */
  modelVersion?: string;
  /** API key. When omitted, no Authorization header is sent. */
  apiKey?: string;
  /** Name of an env var holding the API key (resolved by the worker). */
  apiKeyEnv?: string;
  /** Path appended to baseUrl (default "/chat/completions"). */
  path?: string;
  /** Force `{ type: "json_object" }` for structured output (DeepSeek/ZhipuAI). */
  preferJsonObject?: boolean;
};

/**
 * Built-in OpenAI-compatible provider presets. A preset only seeds defaults
 * (provider id, base URL, JSON-object preference); users can still type any
 * provider id, base URL, and model. No brittle model catalogs are embedded.
 */
export type LlmProviderPreset = {
  /** Stable preset id. */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Default provider id forwarded to {@link OpenAiCompatibleProvider}. */
  provider: string;
  /** Default OpenAI-compatible base URL, when known. */
  baseUrl?: string;
  /** Whether structured output should default to json_object. */
  preferJsonObject?: boolean;
};

export const LLM_PROVIDER_PRESETS: readonly LlmProviderPreset[] = [
  {
    id: "openai-compatible",
    label: "OpenAI-compatible (custom)",
    provider: DEFAULT_LLM_PROVIDER_ID,
  },
  {
    id: "openai",
    label: "OpenAI",
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    provider: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    preferJsonObject: true,
  },
  {
    id: "zhipuai",
    label: "ZhipuAI (GLM)",
    provider: "zhipuai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    preferJsonObject: true,
  },
  {
    id: "ollama",
    label: "Ollama",
    provider: "ollama",
    baseUrl: "http://localhost:11434/v1",
  },
  {
    id: "litellm",
    label: "LiteLLM gateway",
    provider: "litellm",
    baseUrl: "http://localhost:4000/v1",
  },
];

/** Fully-resolved, serializable provider options derived from config + env. */
export type ResolvedLlmProviderOptions = {
  provider: string;
  baseUrl: string;
  model: string;
  preferJsonObject: boolean;
  modelVersion?: string;
  apiKey?: string;
  path?: string;
};

/**
 * Resolve provider options for a generation run.
 *
 * Precedence: an explicit per-run {@link LlmRunConfig} overrides the
 * `SESSION2SKILLS_LLM_*` environment variables, which remain the default.
 * DeepSeek/ZhipuAI keep their `preferJsonObject` default; an explicit
 * `preferJsonObject` in the config wins either way.
 *
 * @throws {CliUsageError} when no base URL or model can be resolved.
 */
export function resolveLlmProviderOptions(
  config?: LlmRunConfig,
): ResolvedLlmProviderOptions {
  const explicitProvider = firstNonEmpty(config?.provider);
  const envProvider = firstNonEmpty(process.env.SESSION2SKILLS_LLM_PROVIDER);
  const provider = explicitProvider ?? envProvider ?? DEFAULT_LLM_PROVIDER_ID;
  const providerPreset = findProviderPreset(provider);
  const baseUrl = firstNonEmpty(
    config?.baseUrl,
    explicitProvider ? providerPreset?.baseUrl : undefined,
    process.env.SESSION2SKILLS_LLM_BASE_URL,
    providerPreset?.baseUrl,
  );
  const model = firstNonEmpty(config?.model, process.env.SESSION2SKILLS_LLM_MODEL);

  if (!baseUrl || !model) {
    throw new CliUsageError(HYBRID_LLM_ENV_REQUIRED);
  }

  const modelVersion = firstNonEmpty(
    config?.modelVersion,
    process.env.SESSION2SKILLS_LLM_MODEL_VERSION,
  );
  const providerPrefersJson =
    providerPreset?.preferJsonObject ?? (provider === "deepseek" || provider === "zhipuai");
  const preferJsonObject = config?.preferJsonObject ?? providerPrefersJson;
  const apiKey = resolveApiKey(config);
  const path = firstNonEmpty(config?.path);

  return {
    provider,
    baseUrl,
    model,
    preferJsonObject,
    ...(modelVersion !== undefined ? { modelVersion } : {}),
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(path !== undefined ? { path } : {}),
  };
}

/**
 * Resolve a provider for a generation run by constructing an
 * {@link OpenAiCompatibleProvider} from {@link resolveLlmProviderOptions}.
 *
 * @throws {CliUsageError} when no base URL or model can be resolved.
 */
export function resolveLlmProvider(config?: LlmRunConfig): ResolvedLlmProvider {
  const options = resolveLlmProviderOptions(config);
  const provider = new OpenAiCompatibleProvider({
    provider: options.provider,
    baseUrl: options.baseUrl,
    ...(options.apiKey !== undefined ? { apiKey: options.apiKey } : {}),
    defaultModel: {
      model: options.model,
      ...(options.modelVersion !== undefined ? { version: options.modelVersion } : {}),
    },
    preferJsonObject: options.preferJsonObject,
    ...(options.path !== undefined ? { path: options.path } : {}),
  });

  return new LlmProviderRegistry([{ provider }]).resolve(provider.provider);
}

function resolveApiKey(config: LlmRunConfig | undefined): string | undefined {
  const direct = firstNonEmpty(config?.apiKey);
  if (direct !== undefined) {
    return direct;
  }
  const envName = firstNonEmpty(config?.apiKeyEnv) ?? DEFAULT_LLM_API_KEY_ENV;
  return firstNonEmpty(process.env[envName]);
}

function findProviderPreset(provider: string): LlmProviderPreset | undefined {
  return LLM_PROVIDER_PRESETS.find(
    (preset) => preset.id === provider || preset.provider === provider,
  );
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}
