import { CliUsageError } from "./errors.js";

export type TonePreset = "concise" | "balanced" | "detailed";

export function parsePositiveInteger(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new CliUsageError(`Expected a positive integer, received: ${value}`);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CliUsageError(`Expected a positive integer, received: ${value}`);
  }

  return parsed;
}

export function parseTonePreset(value: string): TonePreset {
  if (value === "concise" || value === "balanced" || value === "detailed") {
    return value;
  }

  throw new CliUsageError(`Expected tone to be one of concise, balanced, detailed. Received: ${value}`);
}
