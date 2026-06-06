/**
 * Shared LLM utility functions used by both llm-extractors and llm-reducers.
 *
 * These were duplicated across the two modules and are now consolidated here.
 */

import type { LLMFinishReason, LLMTraceWarning, PromptSetVersion } from "../normalize/models.js";
import { LlmProviderError, toErrorMessage } from "../shared/errors.js";

// ---------------------------------------------------------------------------
// PromptSetVersion derivation
// ---------------------------------------------------------------------------

export function toPromptSetVersion(packetVersion: string): PromptSetVersion {
  // Packet versions are bare semver like "1.0.0" or "0.0.0"
  // PromptSetVersion expects "prompt-set/..." format
  if (packetVersion.startsWith("prompt-set/")) {
    return packetVersion as PromptSetVersion;
  }
  return `prompt-set/${packetVersion}` as PromptSetVersion;
}

// ---------------------------------------------------------------------------
// LLM failure classification
// ---------------------------------------------------------------------------

export function classifyLlmFailure(error: unknown): { message: string; warning: LLMTraceWarning } {
  const message = toErrorMessage(error);
  const normalized = message.toLowerCase();
  const cause = getCauseMessage(error);

  if (normalized.includes("timed out") || normalized.includes("timeout")) {
    return {
      message,
      warning: { code: "provider-timeout", message },
    };
  }

  if (
    normalized.includes("invalid json")
    || normalized.includes("malformed")
    || normalized.includes("empty structured response")
    || normalized.includes("must be a json object")
  ) {
    return {
      message,
      warning: { code: "provider-malformed-output", message },
    };
  }

  if (cause.includes("fetch") || cause.includes("network") || cause.includes("connect") || cause.includes("socket")) {
    return {
      message,
      warning: { code: "provider-connection-error", message },
    };
  }

  return {
    message,
    warning: { code: "provider-error", message },
  };
}

export function getCauseMessage(error: unknown): string {
  if (!(error instanceof LlmProviderError) || !("cause" in error)) {
    return "";
  }

  const cause = (error as { cause?: unknown }).cause;
  return toErrorMessage(cause).toLowerCase();
}

// ---------------------------------------------------------------------------
// Finish reason normalization
// ---------------------------------------------------------------------------

export function normalizeFinishReason(reason: string | undefined): LLMFinishReason {
  switch (reason) {
    case "stop":
    case "length":
    case "content-filter":
    case "tool-call":
      return reason;
    default:
      return "unknown";
  }
}
