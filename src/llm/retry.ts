import { LlmProviderError } from "../shared/errors.js";

import type { LlmRetryPolicy } from "./types.js";

export const DEFAULT_LLM_RETRY_POLICY: LlmRetryPolicy = {
  maxAttempts: 1,
  initialDelayMs: 250,
  maxDelayMs: 2000,
  backoffMultiplier: 2,
};

export async function runWithRetry<T>(options: {
  operation: (attempt: number) => Promise<T>;
  retry?: Partial<LlmRetryPolicy>;
  isRetryable?: (error: unknown) => boolean;
}): Promise<{ value: T; attempts: number }> {
  const policy = resolveRetryPolicy(options.retry);

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      const value = await options.operation(attempt);
      return { value, attempts: attempt };
    } catch (error) {
      const shouldRetry = attempt < policy.maxAttempts && (options.isRetryable?.(error) ?? isRetryableLlmError(error));
      if (!shouldRetry) {
        throw error;
      }

      await sleep(getRetryDelayMs(policy, attempt, error));
    }
  }

  throw new Error("Retry loop exited unexpectedly.");
}

export function resolveRetryPolicy(retry?: Partial<LlmRetryPolicy>): LlmRetryPolicy {
  return {
    maxAttempts: retry?.maxAttempts ?? DEFAULT_LLM_RETRY_POLICY.maxAttempts,
    initialDelayMs: retry?.initialDelayMs ?? DEFAULT_LLM_RETRY_POLICY.initialDelayMs,
    maxDelayMs: retry?.maxDelayMs ?? DEFAULT_LLM_RETRY_POLICY.maxDelayMs,
    backoffMultiplier: retry?.backoffMultiplier ?? DEFAULT_LLM_RETRY_POLICY.backoffMultiplier,
  };
}

export function isRetryableLlmError(error: unknown): boolean {
  return error instanceof LlmProviderError && error.retryable;
}

function getRetryDelayMs(policy: LlmRetryPolicy, attempt: number, error: unknown): number {
  if (error instanceof LlmProviderError && error.retryAfterMs !== undefined) {
    return error.retryAfterMs;
  }

  const exponentialDelay = policy.initialDelayMs * policy.backoffMultiplier ** Math.max(attempt - 1, 0);
  return Math.min(exponentialDelay, policy.maxDelayMs);
}

async function sleep(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
