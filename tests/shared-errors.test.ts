import { describe, expect, it } from "vitest";

import {
  CliUsageError,
  LlmProviderError,
  OpenCodeAdapterError,
  toErrorMessage,
} from "../src/shared/errors.js";

describe("toErrorMessage", () => {
  it("returns error.message for Error instances", () => {
    expect(toErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("returns message for Error subclasses", () => {
    expect(toErrorMessage(new CliUsageError("usage"))).toBe("usage");
    expect(toErrorMessage(new OpenCodeAdapterError("adapter"))).toBe("adapter");
    expect(toErrorMessage(new LlmProviderError("llm"))).toBe("llm");
  });

  it("returns String(value) for non-Error values", () => {
    expect(toErrorMessage("plain string")).toBe("plain string");
    expect(toErrorMessage(42)).toBe("42");
    expect(toErrorMessage(null)).toBe("null");
    expect(toErrorMessage(undefined)).toBe("undefined");
    expect(toErrorMessage({ message: "obj" })).toBe("[object Object]");
  });
});

describe("CliUsageError", () => {
  it("is an instance of Error", () => {
    const err = new CliUsageError("bad input");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CliUsageError);
  });

  it("sets name and message", () => {
    const err = new CliUsageError("bad input");
    expect(err.name).toBe("CliUsageError");
    expect(err.message).toBe("bad input");
  });
});

describe("OpenCodeAdapterError", () => {
  it("sets name and message", () => {
    const err = new OpenCodeAdapterError("adapter failed");
    expect(err.name).toBe("OpenCodeAdapterError");
    expect(err.message).toBe("adapter failed");
  });

  it("accepts a cause option", () => {
    const cause = new Error("root cause");
    const err = new OpenCodeAdapterError("wrapper", { cause });
    expect(err.cause).toBe(cause);
  });
});

describe("LlmProviderError", () => {
  it("sets name and message", () => {
    const err = new LlmProviderError("rate limited");
    expect(err.name).toBe("LlmProviderError");
    expect(err.message).toBe("rate limited");
  });

  it("defaults retryable to false", () => {
    const err = new LlmProviderError("err");
    expect(err.retryable).toBe(false);
  });

  it("accepts all options", () => {
    const cause = new Error("timeout");
    const err = new LlmProviderError("err", {
      cause,
      provider: "openai",
      statusCode: 429,
      retryable: true,
      retryAfterMs: 1000,
    });
    expect(err.provider).toBe("openai");
    expect(err.statusCode).toBe(429);
    expect(err.retryable).toBe(true);
    expect(err.retryAfterMs).toBe(1000);
    expect(err.cause).toBe(cause);
  });
});
