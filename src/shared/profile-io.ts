import { readFile } from "node:fs/promises";

import type { PreferenceProfile, ProfileV2 } from "../normalize/models.js";
import { CliUsageError } from "./errors.js";

export async function loadProfileFromFile(filePath: string): Promise<PreferenceProfile | ProfileV2> {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<PreferenceProfile | ProfileV2>;

  if (!parsed || typeof parsed !== "object") {
    throw new CliUsageError(`Invalid profile file: ${filePath}`);
  }

  if (!Array.isArray(parsed.workStyle) || !Array.isArray(parsed.communicationStyle) || !Array.isArray(parsed.validationHabits) || !Array.isArray(parsed.constraints) || !Array.isArray(parsed.confidenceNotes)) {
    throw new CliUsageError(`Profile file is missing required top-level arrays: ${filePath}`);
  }

  return parsed as PreferenceProfile | ProfileV2;
}
