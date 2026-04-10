import type { LlmGenerationMetadata } from "./types.js";

/**
 * Trace payload for a single LLM call.
 * Safe subset (all fields except rawOutput) is persisted by default.
 * rawOutput is opt-in: unbounded, potentially sensitive.
 */
export type LLMTrace = {
  traceID: string;
  timestamp: string;
  promptID: string;
  promptVersion: string;
  provider: LlmGenerationMetadata["provider"];
  model: LlmGenerationMetadata["model"];
  version?: LlmGenerationMetadata["version"];
  inputArtifactRef: string;
  latencyMs: number;
  usage?: LlmGenerationMetadata["usage"];
  parsedOutput: unknown;
  /** NOT persisted by default. Opt-in only for debugging. */
  rawOutput?: string;
};

/**
 * Safe-by-default persistence policy.
 * Metadata and parsed output always written; raw text is opt-in.
 */
export type TracePolicy = {
  persistMetadata: boolean;
  persistParsedOutput: boolean;
  /** Unbounded, potentially sensitive. Default false. */
  persistRawOutput: boolean;
};

export const DEFAULT_TRACE_POLICY: TracePolicy = {
  persistMetadata: true,
  persistParsedOutput: true,
  persistRawOutput: false,
};

/**
 * Strip a trace down to what the policy allows.
 * Returns null if metadata persistence is disabled.
 */
export function applyTracePolicy(
  trace: LLMTrace,
  policy: TracePolicy = DEFAULT_TRACE_POLICY,
): LLMTrace | null {
  if (!policy.persistMetadata) {
    return null;
  }

  const safe: LLMTrace = {
    traceID: trace.traceID,
    timestamp: trace.timestamp,
    promptID: trace.promptID,
    promptVersion: trace.promptVersion,
    provider: trace.provider,
    model: trace.model,
    version: trace.version,
    inputArtifactRef: trace.inputArtifactRef,
    latencyMs: trace.latencyMs,
    usage: trace.usage,
    parsedOutput: policy.persistParsedOutput ? trace.parsedOutput : undefined,
  };

  if (policy.persistRawOutput && trace.rawOutput !== undefined) {
    safe.rawOutput = trace.rawOutput;
  }

  return safe;
}

export function generateTraceID(): string {
  const random = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `trace_${ts}_${random}`;
}

export function createTrace(input: {
  promptID: string;
  promptVersion: string;
  provider: LlmGenerationMetadata["provider"];
  model: LlmGenerationMetadata["model"];
  version?: LlmGenerationMetadata["version"];
  inputArtifactRef: string;
  latencyMs: number;
  usage?: LlmGenerationMetadata["usage"];
  parsedOutput: unknown;
  rawOutput?: string;
}): LLMTrace {
  return {
    traceID: generateTraceID(),
    timestamp: new Date().toISOString(),
    ...input,
  };
}
