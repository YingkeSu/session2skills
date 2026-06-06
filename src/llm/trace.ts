import type { LlmGenerationMetadata } from "./types.js";
import type {
  LLMTrace as PersistedLLMTrace,
  LLMTraceMessage,
} from "../normalize/models.js";
import { redactSecretsDeep, redactSecretsFromString } from "../shared/redaction.js";

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
  /** Full prompt/message content may include raw user code or secrets. Default false. */
  persistRequestContent?: boolean;
  /** Unbounded, potentially sensitive. Default false. */
  persistRawOutput: boolean;
};

export const DEFAULT_TRACE_POLICY: TracePolicy = {
  persistMetadata: true,
  persistParsedOutput: true,
  persistRequestContent: false,
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
    parsedOutput: policy.persistParsedOutput ? redactSecretsDeep(trace.parsedOutput) : undefined,
  };

  if (policy.persistRawOutput && trace.rawOutput !== undefined) {
    safe.rawOutput = redactSecretsFromString(trace.rawOutput);
  }

  return safe;
}

export function applyPersistedTracePolicy(
  trace: PersistedLLMTrace,
  policy: TracePolicy = DEFAULT_TRACE_POLICY,
): PersistedLLMTrace | null {
  if (!policy.persistMetadata) {
    return null;
  }

  const { rawText, structuredOutput, ...responseMetadata } = trace.response;

  return {
    ...trace,
    request: {
      ...trace.request,
      messages: policy.persistRequestContent
        ? redactSecretsDeep(trace.request.messages)
        : trace.request.messages.map(redactTraceMessage),
    },
    response: {
      ...responseMetadata,
      ...(policy.persistParsedOutput && structuredOutput !== undefined
        ? { structuredOutput: redactSecretsDeep(structuredOutput) }
        : {}),
      ...(policy.persistRawOutput && rawText !== undefined
        ? { rawText: redactSecretsFromString(rawText) }
        : {}),
    },
  };
}

export function sanitizePersistedTraces(
  traces: ReadonlyArray<PersistedLLMTrace>,
  policy: TracePolicy = DEFAULT_TRACE_POLICY,
): Array<PersistedLLMTrace> {
  return traces
    .map((trace) => applyPersistedTracePolicy(trace, policy))
    .filter((trace): trace is PersistedLLMTrace => trace !== null);
}

export function generateTraceID(): string {
  const random = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `trace_${ts}_${random}`;
}

function redactTraceMessage(message: LLMTraceMessage): LLMTraceMessage {
  return {
    ...message,
    content: `[content omitted: ${message.content.length} chars]`,
  };
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
