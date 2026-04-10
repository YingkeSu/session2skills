import { CliUsageError } from "../shared/errors.js";

import type { LlmProviderRegistration, ResolvedLlmProvider } from "./provider.js";
import type { LlmModelMetadata, LlmModelRef } from "./types.js";

export class LlmProviderRegistry {
  private readonly registrations = new Map<string, RegisteredProvider>();

  constructor(registrations: readonly LlmProviderRegistration[] = []) {
    for (const registration of registrations) {
      this.register(registration);
    }
  }

  register(registration: LlmProviderRegistration): this {
    const providerId = registration.provider.provider;
    if (this.registrations.has(providerId)) {
      throw new CliUsageError(`LLM provider '${providerId}' is already registered.`);
    }

    const models = registration.models ?? registration.provider.listModels();
    const defaultModel = registration.defaultModel ?? registration.provider.defaultModel;

    if (defaultModel && models.length > 0 && !findModelMetadata(models, defaultModel)) {
      throw new CliUsageError(
        `Default model '${defaultModel.model}' is not registered for provider '${providerId}'.`,
      );
    }

    this.registrations.set(providerId, {
      provider: registration.provider,
      models,
      defaultModel,
    });

    return this;
  }

  list(): readonly LlmProviderRegistration[] {
    return Array.from(this.registrations.values(), (registration) => ({
      provider: registration.provider,
      models: registration.models,
      defaultModel: registration.defaultModel,
    }));
  }

  get(providerId: string): LlmProviderRegistration | undefined {
    const registration = this.registrations.get(providerId);
    if (!registration) {
      return undefined;
    }

    return {
      provider: registration.provider,
      models: registration.models,
      defaultModel: registration.defaultModel,
    };
  }

  require(providerId: string): LlmProviderRegistration {
    const registration = this.get(providerId);
    if (!registration) {
      throw new CliUsageError(`Unknown LLM provider '${providerId}'.`);
    }

    return registration;
  }

  resolve(providerId: string, model?: LlmModelRef): ResolvedLlmProvider {
    const registration = this.require(providerId);
    const resolvedModel = model ?? registration.defaultModel ?? inferSingleModel(registration.models);

    if (!resolvedModel) {
      throw new CliUsageError(`No model selected for provider '${providerId}'.`);
    }

    const metadata = findModelMetadata(registration.models, resolvedModel);
    if (registration.models && registration.models.length > 0 && !metadata) {
      throw new CliUsageError(
        `Unknown model '${resolvedModel.model}' for provider '${providerId}'.`,
      );
    }

    return {
      provider: registration.provider,
      model: metadata
        ? { model: metadata.model, version: metadata.version }
        : { model: resolvedModel.model, version: resolvedModel.version },
      metadata,
    };
  }
}

type RegisteredProvider = {
  provider: LlmProviderRegistration["provider"];
  models: readonly LlmModelMetadata[];
  defaultModel?: LlmModelRef;
};

function inferSingleModel(models: readonly LlmModelMetadata[] | undefined): LlmModelRef | undefined {
  if (!models || models.length !== 1) {
    return undefined;
  }

  return { model: models[0].model, version: models[0].version };
}

function findModelMetadata(
  models: readonly LlmModelMetadata[] | undefined,
  target: LlmModelRef,
): LlmModelMetadata | undefined {
  return models?.find((model) => {
    if (model.model !== target.model) {
      return false;
    }

    if (target.version && model.version && model.version !== target.version) {
      return false;
    }

    return true;
  });
}
