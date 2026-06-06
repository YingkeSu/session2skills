import { describe, expect, it } from "vitest";

import { LlmProviderError } from "../src/shared/errors.js";
import { isRetryableLlmError, resolveRetryPolicy, runWithRetry } from "../src/llm/retry.js";

describe("isRetryableLlmError", () => {
  it("returns true for retryable LlmProviderError", () => {
    expect(isRetryableLlmError(new LlmProviderError("err", { retryable: true }))).toBe(true);
  });

  it("returns false for non-retryable LlmProviderError", () => {
    expect(isRetryableLlmError(new LlmProviderError("err", { retryable: false }))).toBe(false);
  });

  it("returns false for non-LlmProviderError", () => {
    expect(isRetryableLlmError(new Error("err"))).toBe(false);
    expect(isRetryableLlmError("string")).toBe(false);
  });
});

describe("resolveRetryPolicy", () => {
  it("returns defaults with no override", () => {
    const policy = resolveRetryPolicy();
    expect(policy.maxAttempts).toBe(1);
    expect(policy.initialDelayMs).toBe(250);
  });

  it("merges partial overrides", () => {
    const policy = resolveRetryPolicy({ maxAttempts: 3 });
    expect(policy.maxAttempts).toBe(3);
    expect(policy.initialDelayMs).toBe(250);
  });
});

describe("runWithRetry", () => {
  it("returns result on first success", async () => {
    const result = await runWithRetry({
      operation: async () => 42,
      retry: { maxAttempts: 3, initialDelayMs: 1 },
    });
    expect(result.value).toBe(42);
    expect(result.attempts).toBe(1);
  });

  it("retries on retryable errors", async () => {
    let attempt = 0;
    const result = await runWithRetry({
      operation: async () => {
        attempt += 1;
        if (attempt < 3) throw new LlmProviderError("retry", { retryable: true });
        return "success";
      },
      retry: { maxAttempts: 5, initialDelayMs: 1 },
    });
    expect(result.value).toBe("success");
    expect(result.attempts).toBe(3);
  });

  it("does not retry on non-retryable errors", async () => {
    await expect(
      runWithRetry({
        operation: async () => {
          throw new Error("fatal");
        },
        retry: { maxAttempts: 3, initialDelayMs: 1 },
      }),
    ).rejects.toThrow("fatal");
  });

  it("stops retrying after maxAttempts", async () => {
    await expect(
      runWithRetry({
        operation: async () => {
          throw new LlmProviderError("always fail", { retryable: true });
        },
        retry: { maxAttempts: 2, initialDelayMs: 1 },
      }),
    ).rejects.toThrow("always fail");
  });
});
