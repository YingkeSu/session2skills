/**
 * Versioned prompt template system.
 *
 * Every prompt has a stable ID and explicit semver version.
 * The registry enforces uniqueness and rejects missing versions.
 */

export type PromptTemplate<TOutput = unknown> = {
  /** Stable identifier (e.g. "classify-work-style"). */
  id: string;
  /** Semantic version of this template (e.g. "1.0.0"). */
  version: string;
  /** Human-readable description of what this prompt does. */
  description: string;
  /** The system message injected before the user payload. */
  systemPrompt: string;
  /** JSON Schema that the model output must satisfy. */
  outputSchema: Record<string, unknown>;
  /** The expected TypeScript type the parsed output conforms to. */
  outputTypeHint?: string;
};

export type PromptRegistry = {
  register<T>(template: PromptTemplate<T>): void;
  get(id: string, version?: string): PromptTemplate;
  /** List all registered prompt IDs with their latest version. */
  list(): Array<{ id: string; version: string; description: string }>;
};

class PromptRegistryImpl implements PromptRegistry {
  private entries = new Map<string, Map<string, PromptTemplate>>();

  register<T>(template: PromptTemplate<T>): void {
    if (!template.id) {
      throw new PromptRegistryError("prompt ID is required");
    }
    if (!template.version || !isValidSemver(template.version)) {
      throw new PromptRegistryError(
        `prompt "${template.id}" has invalid version "${template.version}". Expected semver (e.g. "1.0.0").`,
      );
    }

    let versionMap = this.entries.get(template.id);
    if (!versionMap) {
      versionMap = new Map();
      this.entries.set(template.id, versionMap);
    }

    const existing = versionMap.get(template.version);
    if (existing) {
      throw new PromptRegistryError(
        `prompt "${template.id}" version "${template.version}" is already registered`,
      );
    }

    versionMap.set(template.version, template);
  }

  get(id: string, version?: string): PromptTemplate {
    const versionMap = this.entries.get(id);
    if (!versionMap) {
      throw new PromptRegistryError(`prompt "${id}" not found in registry`);
    }

    if (version) {
      const template = versionMap.get(version);
      if (!template) {
        throw new PromptRegistryError(
          `prompt "${id}" version "${version}" not found`,
        );
      }
      return template;
    }

    const latest = getLatestVersion(versionMap);
    if (!latest) {
      throw new PromptRegistryError(`prompt "${id}" has no versions registered`);
    }
    return latest;
  }

  list(): Array<{ id: string; version: string; description: string }> {
    const result: Array<{ id: string; version: string; description: string }> = [];
    for (const [id, versionMap] of this.entries) {
      const latest = getLatestVersion(versionMap);
      if (latest) {
        result.push({ id, version: latest.version, description: latest.description });
      }
    }
    return result;
  }
}

export class PromptRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptRegistryError";
  }
}

export function createPromptRegistry(): PromptRegistry {
  return new PromptRegistryImpl();
}

function isValidSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version);
}

function getLatestVersion(versionMap: Map<string, PromptTemplate>): PromptTemplate | undefined {
  let latest: PromptTemplate | undefined;
  for (const template of versionMap.values()) {
    if (!latest || compareSemver(template.version, latest.version) > 0) {
      latest = template;
    }
  }
  return latest;
}

function compareSemver(a: string, b: string): number {
  const pa = a.split("-")[0]!.split(".").map(Number);
  const pb = b.split("-")[0]!.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
