import { readFile } from "node:fs/promises";

import type { MergedClaim, PreferenceProfile, ProfileV2, WorkflowSignalKind } from "../normalize/models.js";
import { CliUsageError } from "./errors.js";

const LEGACY_REQUIRED_ARRAYS = ["workStyle", "communicationStyle", "validationHabits", "constraints", "confidenceNotes"] as const;
const EXTENDED_SIGNAL_ARRAYS = ["tokenEfficiency", "modelSelection", "delegationPattern"] as const;
const PROFILE_V2_REQUIRED_ARRAYS = ["mergedClaims", "acceptedClaims", "tentativeClaims"] as const;
const WORKFLOW_SIGNAL_KINDS = [
  "work-style",
  "communication-style",
  "validation-habit",
  "constraint",
  "token-efficiency",
  "model-selection",
  "delegation-pattern",
] as const satisfies ReadonlyArray<WorkflowSignalKind>;

export async function loadProfileFromFile(filePath: string): Promise<PreferenceProfile | ProfileV2> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new CliUsageError(`Profile file not found: ${filePath}`);
    }
    if (code === "EISDIR") {
      throw new CliUsageError(`Not a file: ${filePath}`);
    }
    throw new CliUsageError(`Cannot read profile file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    throw new CliUsageError(`Invalid JSON in profile file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliUsageError(`Invalid profile file (expected JSON object): ${filePath}`);
  }

  for (const key of LEGACY_REQUIRED_ARRAYS) {
    if (!Array.isArray(parsed[key])) {
      throw new CliUsageError(`Profile file is missing required array "${key}": ${filePath}`);
    }
  }

  for (const key of EXTENDED_SIGNAL_ARRAYS) {
    if (parsed[key] === undefined) {
      parsed[key] = [];
    } else if (!Array.isArray(parsed[key])) {
      throw new CliUsageError(`Profile file has invalid array "${key}": ${filePath}`);
    }
  }

  if (parsed.schemaVersion === "profile/v2") {
    if (typeof parsed.promptSetVersion !== "string") {
      throw new CliUsageError(`Hybrid profile/v2 is missing required field "promptSetVersion": ${filePath}`);
    }

    for (const key of PROFILE_V2_REQUIRED_ARRAYS) {
      if (parsed[key] === undefined) {
        throw new CliUsageError(`Hybrid profile/v2 is missing required field "${key}": ${filePath}`);
      }
    }
    if (!Array.isArray(parsed.mergedClaims) || !Array.isArray(parsed.acceptedClaims) || !Array.isArray(parsed.tentativeClaims)) {
      throw new CliUsageError(`Hybrid profile/v2 has invalid claim arrays: ${filePath}`);
    }

    if (parsed.unresolvedAreas === undefined) {
      parsed.unresolvedAreas = [];
    } else if (!Array.isArray(parsed.unresolvedAreas)) {
      throw new CliUsageError(`Hybrid profile/v2 has invalid unresolvedAreas array: ${filePath}`);
    }

    parsed.strongestSignals = normalizeStrongestSignals(parsed.strongestSignals, parsed.mergedClaims as Array<MergedClaim>, filePath);
  }

  if (parsed.schemaVersion === "profile/v2") {
    return parsed as ProfileV2;
  }
  return parsed as PreferenceProfile;
}

function normalizeStrongestSignals(
  value: unknown,
  mergedClaims: Array<MergedClaim>,
  filePath: string,
): ProfileV2["strongestSignals"] {
  if (value !== undefined && (typeof value !== "object" || value === null || Array.isArray(value))) {
    throw new CliUsageError(`Hybrid profile/v2 has invalid strongestSignals object: ${filePath}`);
  }

  const input = (value ?? {}) as Record<string, unknown>;
  const strongestSignals = Object.fromEntries(
    WORKFLOW_SIGNAL_KINDS.map((kind) => {
      const signals = input[kind];
      if (signals === undefined) {
        return [kind, mergedClaims.filter((claim) => claim.dimension === kind).slice(0, 3)];
      }
      if (!Array.isArray(signals)) {
        throw new CliUsageError(`Hybrid profile/v2 has invalid strongestSignals.${kind} array: ${filePath}`);
      }
      return [kind, signals];
    }),
  ) as ProfileV2["strongestSignals"];

  return strongestSignals;
}
