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

export function coercePositiveInteger(value: unknown, defaultValue: number): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new CliUsageError("recent must be a positive integer");
  }

  return value;
}

export function coerceTonePreset(value: unknown, defaultValue: TonePreset): TonePreset {
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== "string") {
    throw new CliUsageError("tone must be a valid preset");
  }
  return parseTonePreset(value);
}
