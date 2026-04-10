import { CliUsageError } from "./errors.js";

export type TonePreset = "concise" | "balanced" | "detailed";

export function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
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
