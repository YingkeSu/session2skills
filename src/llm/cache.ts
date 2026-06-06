import { createHash } from "node:crypto";

import type { CandidateClaim, LLMTrace } from "../normalize/models.js";

export type LLMCacheValue<TClaim extends CandidateClaim = CandidateClaim> = {
  claims: Array<TClaim>;
  traces: Array<LLMTrace>;
  timestamp: string;
};

export interface LLMCache<TClaim extends CandidateClaim = CandidateClaim> {
  get(key: string): LLMCacheValue<TClaim> | undefined;
  set(key: string, value: LLMCacheValue<TClaim>): void;
  hash(inputs: unknown): string;
}

type InMemoryLlmCacheOptions = {
  ttlMs?: number;
  maxEntries?: number;
};

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 256;

class InMemoryLlmCache<TClaim extends CandidateClaim = CandidateClaim> implements LLMCache<TClaim> {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly entries = new Map<string, LLMCacheValue<TClaim>>();

  constructor(options: InMemoryLlmCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  get(key: string): LLMCacheValue<TClaim> | undefined {
    const value = this.entries.get(key);
    if (!value) {
      return undefined;
    }

    const expiresAt = Date.parse(value.timestamp) + this.ttlMs;
    if (Number.isFinite(expiresAt)) {
      if (Date.now() > expiresAt) {
        this.entries.delete(key);
        return undefined;
      }
    } else {
      this.entries.delete(key);
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, value);
    return structuredClone(value);
  }

  set(key: string, value: LLMCacheValue<TClaim>): void {
    const cloned = structuredClone(value);
    this.entries.delete(key);
    this.entries.set(key, cloned);
    this.prune();
  }

  hash(inputs: unknown): string {
    return createHash("sha256")
      .update(stableSerialize(inputs))
      .digest("hex");
  }

  private prune(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (!oldestKey) {
        return;
      }
      this.entries.delete(oldestKey);
    }
  }
}

let defaultCache: InMemoryLlmCache = new InMemoryLlmCache();

export function createInMemoryLlmCache<TClaim extends CandidateClaim = CandidateClaim>(
  options?: InMemoryLlmCacheOptions,
): LLMCache<TClaim> {
  return new InMemoryLlmCache<TClaim>(options);
}

export function getDefaultLlmCache<TClaim extends CandidateClaim = CandidateClaim>(): LLMCache<TClaim> {
  return defaultCache as LLMCache<TClaim>;
}

export function clearDefaultLlmCache(): void {
  defaultCache = new InMemoryLlmCache();
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(normalizeForSerialization(value));
}

function normalizeForSerialization(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForSerialization(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};

  for (const key of Object.keys(record).sort()) {
    normalized[key] = normalizeForSerialization(record[key]);
  }

  return normalized;
}
